// Printing a PDF from the page. Chromium on the desktop prints a PDF in a hidden frame through the frame's own
// print(). Firefox's PDF viewer counts as another origin (print() throws), Safari prints embedded PDFs blank and
// mobile browsers have no embedded viewer: those open the PDF in a new tab and print from there.

type UserAgentData = { brands: { brand: string }[]; mobile: boolean }

/** Whether this browser can open the print dialog for a PDF itself. */
export function canPrintDirectly(): boolean {
  const data = (navigator as Navigator & { userAgentData?: UserAgentData }).userAgentData
  return data !== undefined && !data.mobile && data.brands.some(({ brand }) => brand === 'Chromium')
}

/** Loads the PDF into a hidden frame and opens the print dialog; returns the cleanup (removes the frame). */
export function printPdf(blob: Blob): () => void {
  const url = URL.createObjectURL(blob)
  const frame = document.createElement('iframe')
  frame.title = 'Druckfassung der Rechnung'
  frame.tabIndex = -1
  frame.setAttribute('aria-hidden', 'true')
  // Classes, not a style attribute: the CSP does not allow inline styles. The frame must stay rendered for the PDF viewer.
  frame.className = 'pointer-events-none invisible fixed right-0 bottom-0 size-0 border-0'
  frame.addEventListener('load', () => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
  })
  frame.src = url
  document.body.append(frame)
  return () => {
    frame.remove()
    URL.revokeObjectURL(url)
  }
}
