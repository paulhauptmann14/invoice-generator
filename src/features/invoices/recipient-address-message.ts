/** Shown in the export panel and sent by the export routes: "Empfängeranschrift unvollständig (Pflicht ab 250 €): Straße, PLZ, Ort." */
export function recipientAddressMessage(fields: string[]): string {
  return `Empfängeranschrift unvollständig (Pflicht ab 250 €): ${fields.join(', ')}.`
}
