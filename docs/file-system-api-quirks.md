The file system API doesn't support modifying the creation date of a file; it likely uses Date.now().

The file system API creates a temp swap file alongside the actual download; the latter stays at 0kb til the file's downloaded into the swap file, then an atomic swap happens. For streaming into a large file/zip, this means the actual file name stays misleadingly at 0kb until the download's done.
