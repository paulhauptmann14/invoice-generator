/**
 * Saving an export where the person chooses: the browser's own save dialog (File System Access API,
 * Chrome and Edge over HTTPS). Safari and Firefox do not offer it; there the export stays a normal
 * download into the downloads folder.
 */

type FilePickerType = { description: string; accept: Record<string, string[]> }
export type SavePicker = (options: { suggestedName: string; types: FilePickerType[] }) => Promise<FileSystemFileHandle>
type ExportFormat = 'pdf' | 'docx'

const FILE_TYPES: Record<ExportFormat, FilePickerType> = {
  pdf: { description: 'PDF-Dokument', accept: { 'application/pdf': ['.pdf'] } },
  docx: {
    description: 'Word-Dokument',
    accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] },
  },
}

/** The save dialog of this browser, or null where there is none. */
export function savePicker(win: { showSaveFilePicker?: unknown } = window as never): SavePicker | null {
  const picker = win.showSaveFilePicker
  return typeof picker === 'function' ? (picker.bind(win) as SavePicker) : null
}

export type LocationChoice = { kind: 'chosen'; handle: FileSystemFileHandle } | { kind: 'cancelled' } | { kind: 'unavailable' }

/**
 * Opens the save dialog. Must be the first await after the click: browsers only show it while the
 * click still counts as user activation. Any failure other than cancelling falls back to the download.
 */
export async function chooseLocation(picker: SavePicker, suggestedName: string, format: ExportFormat): Promise<LocationChoice> {
  try {
    return { kind: 'chosen', handle: await picker({ suggestedName, types: [FILE_TYPES[format]] }) }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return { kind: 'cancelled' }
    console.error(error)
    return { kind: 'unavailable' }
  }
}

/** Writes the file; on failure the half-written file is discarded and the error is passed on. */
export async function writeFile(handle: FileSystemFileHandle, blob: Blob): Promise<void> {
  const stream = await handle.createWritable()
  try {
    await stream.write(blob)
    await stream.close()
  } catch (error) {
    await stream.abort().catch(() => undefined)
    throw error
  }
}
