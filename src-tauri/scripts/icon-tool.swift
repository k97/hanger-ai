#!/usr/bin/env swift
//
// icon-tool.swift — icon rasterisation helpers for the Hanger AI bundle.
//
// Modes:
//   flatten <AppIcon.icon> <out.png> [size]   compose icon.json into a full-bleed square PNG
//   macos   <in.png> <out.png> [size]         824/1024 rounded-rect with margins + drop shadow
//   resize  <in.png> <out.png> <size>         plain high-quality resample
//
// `flatten` exists because Icon Composer's .icon is a layered source that only
// macOS 26 can render natively. Every other target (Windows, Linux, legacy
// macOS .icns) needs a flat raster, so we compose the same layers ourselves.
//
// Driven by generate-icons.sh — see that script for the full pipeline.

import Foundation
import AppKit

func fail(_ message: String) -> Never {
    FileHandle.standardError.write("icon-tool: \(message)\n".data(using: .utf8)!)
    exit(1)
}

func makeContext(_ size: Int) -> CGContext {
    guard let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8,
                              bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
        fail("could not allocate a \(size)x\(size) context")
    }
    ctx.interpolationQuality = .high
    return ctx
}

func write(_ ctx: CGContext, to path: String) {
    guard let image = ctx.makeImage() else { fail("could not render \(path)") }
    let rep = NSBitmapImageRep(cgImage: image)
    guard let data = rep.representation(using: .png, properties: [:]) else { fail("could not encode \(path)") }
    do { try data.write(to: URL(fileURLWithPath: path)) } catch { fail("could not write \(path): \(error)") }
    print(path)
}

func loadImage(_ path: String) -> CGImage {
    guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
          let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { fail("could not read \(path)") }
    return img
}

// MARK: - icon.json parsing

/// "display-p3:0.35,0.76,0.77,1.0" → NSColor. Falls back to sRGB for unknown spaces.
func parseColor(_ spec: String) -> NSColor {
    let parts = spec.split(separator: ":", maxSplits: 1)
    let space = parts.count == 2 ? String(parts[0]) : "srgb"
    let numbers = String(parts.last!).split(separator: ",").compactMap { Double($0) }
    guard numbers.count >= 3 else { return .white }
    let (r, g, b) = (CGFloat(numbers[0]), CGFloat(numbers[1]), CGFloat(numbers[2]))
    let a = numbers.count > 3 ? CGFloat(numbers[3]) : 1
    return space.hasPrefix("display-p3")
        ? NSColor(displayP3Red: r, green: g, blue: b, alpha: a)
        : NSColor(srgbRed: r, green: g, blue: b, alpha: a)
}

/// A resolved fill: either a gradient, a flat colour, or "draw the image as-is".
enum Fill {
    case gradient(NSGradient, start: CGPoint, stop: CGPoint)
    case solid(NSColor)
    case none

    /// `fill` in icon.json is a string ("automatic" / "none") or a dict.
    static func parse(_ raw: Any?) -> Fill? {
        if let s = raw as? String { return s == "none" ? Fill.none : nil }
        guard let dict = raw as? [String: Any] else { return nil }

        if let colors = dict["linear-gradient"] as? [String], colors.count >= 2 {
            let stops = colors.map { parseColor($0) }
            guard let gradient = NSGradient(colors: stops) else { return nil }
            let o = dict["orientation"] as? [String: Any]
            let s = o?["start"] as? [String: Double] ?? ["x": 0.5, "y": 0]
            let e = o?["stop"] as? [String: Double] ?? ["x": 0.5, "y": 1]
            return .gradient(gradient,
                             start: CGPoint(x: s["x"] ?? 0.5, y: s["y"] ?? 0),
                             stop: CGPoint(x: e["x"] ?? 0.5, y: e["y"] ?? 1))
        }
        if let solid = dict["solid"] as? String { return .solid(parseColor(solid)) }
        return nil
    }

    /// Paint this fill across the whole canvas. icon.json y runs top-down; AppKit runs bottom-up.
    func draw(canvas: CGFloat) {
        let full = NSRect(x: 0, y: 0, width: canvas, height: canvas)
        switch self {
        case .solid(let c):
            c.setFill(); full.fill()
        case .gradient(let g, let start, let stop):
            g.draw(from: CGPoint(x: start.x * canvas, y: (1 - start.y) * canvas),
                   to: CGPoint(x: stop.x * canvas, y: (1 - stop.y) * canvas),
                   options: [.drawsBeforeStartingLocation, .drawsAfterEndingLocation])
        case .none:
            break
        }
    }
}

struct Layer {
    let imageName: String
    let scale: CGFloat
    let translation: CGPoint
    let fill: Fill?          // nil → inherit the document fill
}

func flatten(iconDir: String, size: Int) -> CGContext {
    let jsonPath = "\(iconDir)/icon.json"
    guard let data = FileManager.default.contents(atPath: jsonPath),
          let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        fail("could not parse \(jsonPath)")
    }

    let documentFill = Fill.parse(root["fill"]) ?? .solid(.white)

    // Layers are listed top-first within each group, and groups top-first too.
    var layers: [Layer] = []
    for group in (root["groups"] as? [[String: Any]] ?? []) {
        for raw in (group["layers"] as? [[String: Any]] ?? []) {
            guard let name = raw["image-name"] as? String else { continue }
            let position = raw["position"] as? [String: Any]
            let t = position?["translation-in-points"] as? [Double] ?? [0, 0]
            layers.append(Layer(
                imageName: name,
                scale: CGFloat(position?["scale"] as? Double ?? 1),
                translation: CGPoint(x: t.count > 0 ? t[0] : 0, y: t.count > 1 ? t[1] : 0),
                fill: Fill.parse(raw["fill"])
            ))
        }
    }

    let ctx = makeContext(size)
    let S = CGFloat(size)
    let previous = NSGraphicsContext.current
    NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: false)
    defer { NSGraphicsContext.current = previous }

    documentFill.draw(canvas: S)

    // Icon Composer positions in a 1024-point canvas; scale offsets to our size.
    let unit = S / 1024.0
    let full = CGRect(x: 0, y: 0, width: S, height: S)

    for layer in layers.reversed() {
        let img = loadImage("\(iconDir)/Assets/\(layer.imageName)")
        let side = S * layer.scale
        let rect = CGRect(x: (S - side) / 2 + layer.translation.x * unit,
                          y: (S - side) / 2 - layer.translation.y * unit,
                          width: side, height: side)

        // Render the layer onto its own canvas first. Compositing it as a single
        // image afterwards keeps the drop shadow outside the fill's clip region —
        // painting through a mask directly would clip the shadow away with it.
        //
        // A layer with no "fill" key draws its own pixels; the document fill is
        // the background only, never inherited by layers. Getting this wrong
        // renders same-colour artwork invisible against its own background.
        let layerCtx = makeContext(size)
        let resolved = layer.fill ?? .none
        if case .none = resolved {
            layerCtx.draw(img, in: rect)            // keep the layer's own pixels
        } else {
            let previousLayerCtx = NSGraphicsContext.current
            NSGraphicsContext.current = NSGraphicsContext(cgContext: layerCtx, flipped: false)
            layerCtx.clip(to: rect, mask: img)
            resolved.draw(canvas: S)
            NSGraphicsContext.current = previousLayerCtx
        }
        guard let rendered = layerCtx.makeImage() else { fail("could not render layer \(layer.imageName)") }

        ctx.saveGState()
        ctx.setShadow(offset: CGSize(width: 0, height: -S * 0.006), blur: S * 0.018,
                      color: CGColor(gray: 0, alpha: 0.28))
        ctx.draw(rendered, in: full)
        ctx.restoreGState()
    }
    return ctx
}

// MARK: - entry point

let args = CommandLine.arguments
guard args.count >= 4 else {
    fail("usage: icon-tool <flatten|macos|resize> <in> <out> [size]")
}
let mode = args[1], input = args[2], output = args[3]

switch mode {
case "flatten":
    let size = args.count > 4 ? Int(args[4]) ?? 1024 : 1024
    write(flatten(iconDir: input, size: size), to: output)

case "macos":
    // Apple's template: an 824px content box on a 1024 canvas, r ≈ 185.4.
    let canvas = args.count > 4 ? Int(args[4]) ?? 1024 : 1024
    let c = CGFloat(canvas)
    let box = (c * 824.0 / 1024.0).rounded()
    let radius = c * 185.4 / 1024.0
    let inset = ((c - box) / 2).rounded()
    let rect = CGRect(x: inset, y: inset, width: box, height: box)

    let maskCtx = makeContext(canvas)
    maskCtx.addPath(CGPath(roundedRect: rect, cornerWidth: radius, cornerHeight: radius, transform: nil))
    maskCtx.clip()
    maskCtx.draw(loadImage(input), in: rect)
    guard let masked = maskCtx.makeImage() else { fail("masking failed") }

    let ctx = makeContext(canvas)
    ctx.setShadow(offset: CGSize(width: 0, height: -c * 0.01), blur: c * 0.02,
                  color: CGColor(gray: 0, alpha: 0.3))
    ctx.draw(masked, in: CGRect(x: 0, y: 0, width: c, height: c))
    write(ctx, to: output)

case "resize":
    guard args.count > 4, let size = Int(args[4]) else { fail("resize needs a size") }
    let ctx = makeContext(size)
    ctx.draw(loadImage(input), in: CGRect(x: 0, y: 0, width: size, height: size))
    write(ctx, to: output)

default:
    fail("unknown mode '\(mode)' — expected flatten|macos|resize")
}
