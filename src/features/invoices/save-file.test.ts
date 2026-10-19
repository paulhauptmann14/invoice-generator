import { describe, expect, test, vi } from 'vitest'
import { chooseLocation, savePicker, writeFile } from './save-file'

const handle = (name: string) => ({ name, createWritable: vi.fn() }) as unknown as FileSystemFileHandle

describe('savePicker', () => {
  test('is null where the browser has no save dialog (Safari, Firefox)', () => {
    expect(savePicker({})).toBeNull()
  })
  test('is the browser function where it exists (Chrome, Edge)', () => {
    const showSaveFilePicker = vi.fn()
    expect(savePicker({ showSaveFilePicker })).not.toBeNull()
  })
})

describe('chooseLocation', () => {
  test('passes the file name and type, returns the chosen file', async () => {
    const picker = vi.fn().mockResolvedValue(handle('Rechnung.pdf'))
    const result = await chooseLocation(picker, 'Rechnung.pdf', 'pdf')
    expect(result).toEqual({ kind: 'chosen', handle: expect.objectContaining({ name: 'Rechnung.pdf' }) })
    expect(picker).toHaveBeenCalledWith({
      suggestedName: 'Rechnung.pdf',
      types: [{ description: 'PDF-Dokument', accept: { 'application/pdf': ['.pdf'] } }],
    })
  })
  test('cancelling the dialog is not an error', async () => {
    const picker = vi.fn().mockRejectedValue(new DOMException('The user aborted a request.', 'AbortError'))
    expect(await chooseLocation(picker, 'a.docx', 'docx')).toEqual({ kind: 'cancelled' })
  })
  test('any other failure falls back to the normal download', async () => {
    const picker = vi.fn().mockRejectedValue(new DOMException('Not allowed', 'SecurityError'))
    expect(await chooseLocation(picker, 'a.pdf', 'pdf')).toEqual({ kind: 'unavailable' })
  })
})

describe('writeFile', () => {
  test('writes the blob and closes the file', async () => {
    const stream = { write: vi.fn(), close: vi.fn(), abort: vi.fn() }
    const h = handle('a.pdf')
    vi.mocked(h.createWritable).mockResolvedValue(stream as unknown as FileSystemWritableFileStream)
    const blob = new Blob(['%PDF'])
    await writeFile(h, blob)
    expect(stream.write).toHaveBeenCalledWith(blob)
    expect(stream.close).toHaveBeenCalled()
    expect(stream.abort).not.toHaveBeenCalled()
  })
  test('a failed write aborts the stream and reports the error', async () => {
    const stream = { write: vi.fn().mockRejectedValue(new Error('disk full')), close: vi.fn(), abort: vi.fn().mockResolvedValue(undefined) }
    const h = handle('a.pdf')
    vi.mocked(h.createWritable).mockResolvedValue(stream as unknown as FileSystemWritableFileStream)
    await expect(writeFile(h, new Blob(['x']))).rejects.toThrow('disk full')
    expect(stream.abort).toHaveBeenCalled()
    expect(stream.close).not.toHaveBeenCalled()
  })
})
