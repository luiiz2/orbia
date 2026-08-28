/**
 * File operation journal and architectural undo types.
 * Every physical mutation generates an immutable journal record.
 */
export type FileOperationType =
  'rename' | 'move' | 'copy' | 'delete' | 'create_dir' | 'optimize_media'

export type FileOperationStatus =
  'pending' | 'completed' | 'failed' | 'rolled_back'

export interface FileOperationRecord {
  operationId: string // UUID
  groupId: string // UUID grouping a batch import/organization action
  type: FileOperationType
  sourcePath: string
  destinationPath: string
  originalFileName: string
  newFileName: string
  timestamp: number // Unix timestamp ms
  status: FileOperationStatus
  errorDetails?: string
  isReversible: boolean
}

export interface FileOperationGroup {
  groupId: string
  description: string
  timestamp: number
  totalOperations: number
  status: 'pending' | 'completed' | 'partially_failed' | 'rolled_back'
  operations: FileOperationRecord[]
}

export interface ProposedFileMutation {
  type: FileOperationType
  sourcePath: string
  destinationPath: string
  originalFileName: string
  newFileName: string
  isReversible: boolean
}

export interface OperationPlan {
  groupId: string
  courseTitle: string
  proposedMutations: ProposedFileMutation[]
  hasConflicts: boolean
  conflictDetails?: string[]
}
