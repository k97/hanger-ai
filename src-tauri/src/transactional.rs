use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use std::io::Write;

#[derive(Debug)]
pub enum TransactionError {
    BackupFailed(String),
    TempWriteFailed(String),
    ValidationFailed(String),
    ReplacementFailed(String),
    Io(std::io::Error),
}

impl std::fmt::Display for TransactionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::BackupFailed(s) => write!(f, "Backup failed: {}", s),
            Self::TempWriteFailed(s) => write!(f, "Writing to temporary file failed: {}", s),
            Self::ValidationFailed(s) => write!(f, "Validation failed: {}", s),
            Self::ReplacementFailed(s) => write!(f, "Atomic replacement failed: {}", s),
            Self::Io(e) => write!(f, "I/O error: {}", e),
        }
    }
}

impl std::error::Error for TransactionError {}

impl From<std::io::Error> for TransactionError {
    fn from(err: std::io::Error) -> Self {
        Self::Io(err)
    }
}

/// Safely writes content to target_path using transactional semantics:
/// 1. Backup: Copy existing target file to `.hanger/backups/[timestamp]_[filename].bak`
/// 2. Temporary write: Write changes to `.filename.tmp` in the same directory
/// 3. Validation: Run syntactic validator closure on the temporary file
/// 4. Atomic replacement: Rename `.filename.tmp` to `filename`
/// 5. Rollback: If validation fails, cleanup temporary file and preserve the original
pub fn write_transactional<F>(
    target_path: &Path,
    content: &[u8],
    validator: F,
) -> Result<(), TransactionError>
where
    F: Fn(&Path) -> Result<(), String>,
{
    // 1. If target file exists, perform backup.
    if target_path.exists() {
        let backups_dir = Path::new(".hanger/backups");
        fs::create_dir_all(backups_dir).map_err(|e| {
            TransactionError::BackupFailed(format!("Failed to create backups directory: {}", e))
        })?;

        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let filename = target_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file");
        let backup_file = backups_dir.join(format!("{}_{}.bak", timestamp, filename));

        fs::copy(target_path, &backup_file).map_err(|e| {
            TransactionError::BackupFailed(format!("Failed to copy target to backup: {}", e))
        })?;
    }

    // 2. Create a temporary file in the same directory as target_path.
    let parent_dir = target_path.parent().unwrap_or_else(|| Path::new("."));
    let temp_file_name = format!(
        ".{}.tmp",
        target_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("temp")
    );
    let temp_path = parent_dir.join(&temp_file_name);

    // Write contents to temporary file
    let mut temp_file = fs::File::create(&temp_path).map_err(|e| {
        TransactionError::TempWriteFailed(format!("Failed to create temporary file: {}", e))
    })?;
    temp_file.write_all(content).map_err(|e| {
        TransactionError::TempWriteFailed(format!("Failed to write to temporary file: {}", e))
    })?;
    temp_file.sync_all().map_err(|e| {
        TransactionError::TempWriteFailed(format!("Failed to sync temporary file: {}", e))
    })?;
    drop(temp_file); // Close handle

    // 3. Run validation function
    if let Err(val_err) = validator(&temp_path) {
        // Rollback: delete temp file
        let _ = fs::remove_file(&temp_path);
        return Err(TransactionError::ValidationFailed(val_err));
    }

    // 4. Atomic replace using rename
    fs::rename(&temp_path, target_path).map_err(|e| {
        let _ = fs::remove_file(&temp_path);
        TransactionError::ReplacementFailed(format!("Atomic replace failed: {}", e))
    })?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_write_transactional_success() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.txt");

        let content = b"Hello, Hanger!";
        let res = write_transactional(&file_path, content, |_| Ok(()));

        assert!(res.is_ok());
        assert_eq!(fs::read(&file_path).unwrap(), content);
    }

    #[test]
    fn test_write_transactional_validation_failure_rollback() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test_fail.txt");

        // Write initial content
        fs::write(&file_path, b"Original Content").unwrap();

        let new_content = b"New Failed Content";
        let res = write_transactional(&file_path, new_content, |_| {
            Err("Invalid syntax".to_string())
        });

        assert!(res.is_err());
        match res.unwrap_err() {
            TransactionError::ValidationFailed(msg) => assert_eq!(msg, "Invalid syntax"),
            _ => panic!("Expected ValidationFailed error"),
        }

        // Verify the original content is intact
        assert_eq!(fs::read_to_string(&file_path).unwrap(), "Original Content");

        // Verify no temp file was left behind
        let temp_path = dir.path().join(".test_fail.txt.tmp");
        assert!(!temp_path.exists());
    }

    #[test]
    fn test_write_transactional_backup_created() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test_backup.txt");

        // Write initial content
        fs::write(&file_path, b"Original Content").unwrap();

        let new_content = b"Updated Content";
        let res = write_transactional(&file_path, new_content, |_| Ok(()));

        assert!(res.is_ok());
        assert_eq!(fs::read_to_string(&file_path).unwrap(), "Updated Content");

        // Verify a backup was created in .hanger/backups
        let backups_dir = Path::new(".hanger/backups");
        assert!(backups_dir.exists());

        // Cleanup backups
        let _ = fs::remove_dir_all(backups_dir);
    }
}
