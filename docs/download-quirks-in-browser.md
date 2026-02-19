Bulk download of files from browser: browsers throttle/guard “multiple automatic downloads.” Expect prompts and potential blocks.
Chrome/Edge: After the first programmatic download, users often see “This site is attempting to download multiple files. Allow?” If denied (default on many setups), subsequent downloads are blocked.
Firefox: Similar “Allow multiple downloads?” prompt; can block after one.
Safari: Requires user gesture; multiple programmatic downloads are frequently blocked or prompt repeatedly. No directory selection API.

URL.revokeObjectURL after a.click(): calling revokeObjectURL synchronously after a programmatic a.click() download is a race condition. The browser may not have initiated the download yet, causing it to silently not happen. Chromium bug: https://issues.chromium.org/issues/41380177, Firefox bug: https://bugzilla.mozilla.org/show_bug.cgi?id=1282407. FileSaver.js uses setTimeout of 40s before revoking. setTimeout(..., 0) also works. Instantly resolved Promises do not. There is no web API to detect when a download has actually started from a blob URL; the File System Access API (showSaveFilePicker) avoids the problem entirely but is Chrome/Edge only.
