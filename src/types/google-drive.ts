export interface GoogleDriveAccountSummary {
  accountId: string
  displayName: string
  email?: string
}

export interface GoogleDriveConnectionStatus {
  configured: boolean
  connected: boolean
  account?: GoogleDriveAccountSummary
}

export type GoogleDriveBrowseRoot = 'my-drive' | 'shared-with-me'

export interface GoogleDriveEntry {
  itemId: string
  name: string
  mimeType: string
  isFolder: boolean
  canDownload: boolean
  canPreview: boolean
  size?: number
  modifiedTime?: string
  driveId?: string
  webViewUrl?: string
}

export interface GoogleDriveFolderListing {
  folderId: string
  folderName: string
  entries: GoogleDriveEntry[]
  nextPageToken?: string
  rootKind?: GoogleDriveBrowseRoot
}

export interface GoogleDrivePlayback {
  url: string
  name: string
  mimeType: string
  size?: number
  seekable: boolean
  canDownload: boolean
  webViewUrl?: string
}

export interface GoogleDrivePlaybackInput {
  itemId: string
  driveId?: string
}

export interface GoogleDriveDownloadInput extends GoogleDrivePlaybackInput {
  /** Used only as the native save dialog's initial filename. */
  suggestedName?: string
}

export type GoogleDriveDownloadResult =
  | { success: true; fileName: string; bytes: number }
  | { success: false; cancelled: true }
