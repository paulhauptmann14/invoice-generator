import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { DOCUMENT_COLORS, type Theme } from '@/lib/domain/theme'
import type { InvoiceViewModel } from '@/lib/domain/view-model'
import { din5008, mm } from '../din5008'
import { type Density, FOOTER_ROOM_MM, oneLine } from './density'

type Props = { vm: InvoiceViewModel; theme: Theme; fontFamily: string; density?: Density }

/** Layout "Klassisch" (and "Kompakt"): DIN 5008 letter (form A/B). Displays view-model strings only, no calculations. */
export function KlassischInvoice({ vm, theme, fontFamily, density = 'normal' }: Props) {
  const compact = density === 'compact'
  const din = din5008(theme.page.din5008)
  const { page } = theme
  const c = theme.colors
  const base = theme.font.baseSizePt
  const rowSize = compact ? Math.max(7, base - 1) : base
  const rowPadding = compact ? 1.5 : 4
  // Body text starts two lines below the address field (DIN 5008).
  const bodyTopMm = din.addressTopMm + din.addressHeightMm + 8.46

  const s = StyleSheet.create({
    page: {
      fontFamily,
      fontSize: base,
      color: c.text,
      paddingTop: mm(page.marginTopMm),
      paddingRight: mm(page.marginRightMm),
      // Room for the fixed footer below the content.
      paddingBottom: mm(page.marginBottomMm) + mm(FOOTER_ROOM_MM[density]),
      paddingLeft: mm(page.marginLeftMm),
    },
    // react-pdf 4.9: no lineHeight on <Page> (it hides the dynamic page-number text), and a unitless lineHeight
    // on a View resolves against that View's own fontSize (default 18 pt) - so containers set both.
    content: { fontSize: base, lineHeight: 1.35 },
    head: { height: mm(bodyTopMm - page.marginTopMm), alignItems: 'flex-end' },
    companyName: { fontSize: base + 3, fontWeight: 700, color: c.primary, textAlign: 'right', maxWidth: mm(90) },
    address: {
      position: 'absolute',
      top: mm(din.addressTopMm),
      left: mm(din.addressLeftMm),
      width: mm(din.addressWidthMm),
      height: mm(din.addressHeightMm),
      fontSize: base,
      lineHeight: 1.35,
    },
    endorsement: { height: mm(din.endorsementZoneMm), justifyContent: 'flex-end', paddingBottom: mm(1) },
    senderLine: { fontSize: 7, color: c.primary, textDecoration: 'underline' },
    info: { position: 'absolute', top: mm(din.infoTopMm), right: mm(page.marginRightMm), width: mm(70), fontSize: base, lineHeight: 1.35 },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: mm(4) },
    infoLabel: { color: c.primary },
    title: {
      fontSize: compact ? Math.max(10, theme.font.headingSizePt * 0.75) : theme.font.headingSizePt,
      fontWeight: 700,
      color: c.primary,
      lineHeight: 1.1,
      marginBottom: mm(compact ? 1.5 : 5),
    },
    titleNumber: { fontWeight: 400 },
    // Kompakt: number, dates and due date in one line below the title instead of the info block.
    infoLine: { flexDirection: 'row', flexWrap: 'wrap', columnGap: mm(5), marginBottom: mm(4), fontSize: base, lineHeight: 1.35 },
    paragraph: { marginBottom: mm(compact ? 3 : 5) },
    table: { marginBottom: mm(2), fontSize: rowSize, lineHeight: compact ? 1.25 : 1.35 },
    th: compact
      ? { flexDirection: 'row', paddingVertical: 2, paddingHorizontal: 4, borderBottomWidth: 0.75, borderBottomColor: c.primary, fontWeight: 700, color: c.primary }
      : { flexDirection: 'row', backgroundColor: c.tableHeaderBg, paddingVertical: 4, paddingHorizontal: 4, fontWeight: 700, color: c.primary },
    tr: { flexDirection: 'row', paddingVertical: rowPadding, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: DOCUMENT_COLORS.rule },
    zebra: { backgroundColor: DOCUMENT_COLORS.zebra },
    colPos: { width: '7%' },
    colDesc: { flexGrow: 1, flexBasis: 0, paddingRight: 6 },
    // Floor keeps the discount line legible in the compact layout.
    itemDiscount: { fontSize: Math.max(6.5, rowSize - 1.5), color: DOCUMENT_COLORS.muted },
    colQty: { width: '9%', textAlign: 'right' },
    colUnit: { width: '9%', paddingLeft: 8 },
    colPrice: { width: '15%', textAlign: 'right' },
    colVat: { width: '9%', textAlign: 'right' },
    colTotal: { width: '15%', textAlign: 'right' },
    totals: { marginLeft: 'auto', width: '50%', paddingHorizontal: 4, fontSize: rowSize, lineHeight: compact ? 1.25 : 1.35 },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: compact ? 0.5 : 1.5 },
    grandTotal: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      borderTopWidth: 1,
      borderTopColor: c.primary,
      paddingTop: 4,
      marginTop: 3,
      fontWeight: 700,
      fontSize: rowSize + 1.5,
      color: c.primary,
    },
    noteBeforeBanks: { marginBottom: mm(1.5) },
    banks: { marginBottom: mm(compact ? 3 : 5) },
    bankRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: mm(4) },
    bankName: { fontWeight: 700 },
    closingBlock: { marginTop: mm(compact ? 5 : 8) },
    footer: {
      position: 'absolute',
      bottom: mm(page.marginBottomMm),
      left: mm(page.marginLeftMm),
      right: mm(page.marginRightMm),
      borderTopWidth: 0.5,
      borderTopColor: c.primary,
      paddingTop: 4,
      flexDirection: 'row',
      flexWrap: compact ? 'wrap' : 'nowrap',
      columnGap: compact ? mm(4) : 8,
      fontSize: compact ? 6.5 : 7,
      lineHeight: compact ? 1.3 : 1.4,
      color: c.primary,
    },
    // Columns size by content so long lines (IBAN) do not wrap.
    footerCol: compact ? {} : { flexGrow: 1, flexShrink: 1, flexBasis: 'auto' },
    pageNumber: {
      position: 'absolute',
      bottom: mm(page.marginBottomMm) - 14,
      left: mm(page.marginLeftMm),
      right: mm(page.marginRightMm),
      textAlign: 'right',
      fontSize: 7,
      color: c.primary,
    },
    mark: { position: 'absolute', left: mm(5), width: mm(4), borderTopWidth: 0.5, borderTopColor: DOCUMENT_COLORS.mark },
  })
  const t = theme.table
  const L = t.labels
  const info: [string, string][] = [
    ['Rechnungsnr.', vm.number],
    ['Rechnungsdatum', vm.issueDate],
    ['Leistungsdatum', vm.serviceDate],
    ...(vm.dueDate ? ([['Fällig am', vm.dueDate]] as [string, string][]) : []),
    ...(vm.recipientVatId ? ([['Ihre USt-IdNr.', vm.recipientVatId]] as [string, string][]) : []),
  ]

  return (
    <Document title={`${vm.title} ${vm.number}`.trim()} author={vm.companyName} language="de">
      <Page size="A4" style={s.page}>
        {/* Fold and punch marks (DIN 5008) */}
        <View fixed style={[s.mark, { top: mm(din.foldMarksMm[0]) }]} />
        <View fixed style={[s.mark, { top: mm(din.punchMarkMm), width: mm(6) }]} />
        <View fixed style={[s.mark, { top: mm(din.foldMarksMm[1]) }]} />

        <View style={s.address}>
          <View style={s.endorsement}>{page.senderLine && vm.senderLine !== '' && <Text style={s.senderLine}>{vm.senderLine}</Text>}</View>
          {vm.recipientLines.map((line, i) => (
            <Text key={i}>{line}</Text>
          ))}
        </View>

        {!compact && (
          <View style={s.info}>
            {info.map(([label, value]) => (
              <View key={label} style={s.infoRow}>
                <Text style={s.infoLabel}>{label}</Text>
                <Text>{value}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={s.content}>
          {/* Letterhead; its height reserves the address/info area so the body always starts below it. */}
          <View style={s.head}>
            <Text style={s.companyName}>{vm.companyName}</Text>
          </View>

          <Text style={s.title}>
            {vm.title}
            {vm.number !== '' && <Text style={s.titleNumber}> {vm.number}</Text>}
          </Text>
          {compact && (
            <View style={s.infoLine}>
              {info.slice(1).map(([label, value]) => (
                <Text key={label}>
                  <Text style={s.infoLabel}>{label} </Text>
                  {value}
                </Text>
              ))}
            </View>
          )}
          {vm.intro !== '' && <Text style={s.paragraph}>{vm.intro}</Text>}

          {/* Header and rows share one view: the fixed header repeats only while the table itself breaks. */}
          <View style={s.table}>
            <View style={s.th} fixed>
              {t.showPosition && <Text style={s.colPos}>{L.position}</Text>}
              <Text style={s.colDesc}>{L.description}</Text>
              <Text style={s.colQty}>{L.quantity}</Text>
              {t.showUnit && <Text style={s.colUnit}>{L.unit}</Text>}
              <Text style={s.colPrice}>{L.unitPrice}</Text>
              {t.showVatRate && <Text style={s.colVat}>{L.vatRate}</Text>}
              <Text style={s.colTotal}>{L.total}</Text>
            </View>
            {vm.items.map((item, i) => (
              <View key={item.position} style={c.zebra && i % 2 === 1 ? [s.tr, s.zebra] : s.tr} wrap={false}>
                {t.showPosition && <Text style={s.colPos}>{item.position}</Text>}
                <View style={s.colDesc}>
                  <Text>{item.description}</Text>
                  {item.discount !== null && <Text style={s.itemDiscount}>{item.discount}</Text>}
                </View>
                <Text style={s.colQty}>{item.quantity}</Text>
                {t.showUnit && <Text style={s.colUnit}>{item.unit}</Text>}
                <Text style={s.colPrice}>{item.unitPrice}</Text>
                {t.showVatRate && <Text style={s.colVat}>{item.vatRate}</Text>}
                <Text style={s.colTotal}>{item.total}</Text>
              </View>
            ))}
          </View>

          <View style={s.totals} wrap={false}>
            {vm.totals.subtotal !== null && vm.totals.discount !== null && (
              <View>
                <View style={s.totalRow}>
                  <Text>Zwischensumme</Text>
                  <Text>{vm.totals.subtotal}</Text>
                </View>
                <View style={s.totalRow}>
                  <Text>{vm.totals.discount.label}</Text>
                  <Text>{vm.totals.discount.amount}</Text>
                </View>
              </View>
            )}
            {vm.taxGroups.map((g) => (
              <View key={g.rate}>
                <View style={s.totalRow}>
                  <Text>Nettobetrag {g.rate}</Text>
                  <Text>{g.net}</Text>
                </View>
                <View style={s.totalRow}>
                  <Text>MwSt. {g.rate}</Text>
                  <Text>{g.vat}</Text>
                </View>
              </View>
            ))}
            <View style={s.grandTotal}>
              <Text>Gesamtbetrag</Text>
              <Text>{vm.totals.gross}</Text>
            </View>
          </View>

          <View style={s.closingBlock} wrap={false}>
            {vm.paymentNote !== '' && <Text style={vm.bankAccounts.length > 0 ? s.noteBeforeBanks : s.paragraph}>{vm.paymentNote}</Text>}
            {vm.bankAccounts.length > 0 && (
              <View style={s.banks}>
                {/* Gaps as flex gaps: the embedded fonts have no em space. */}
                {vm.bankAccounts.map((b, i) => (
                  <View key={i} style={s.bankRow}>
                    {b.bank !== '' && <Text style={s.bankName}>{b.bank}</Text>}
                    {b.rows.map(([label, value]) => (
                      <Text key={label}>
                        {label} {value}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            )}
            {vm.closing !== '' && <Text>{vm.closing}</Text>}
          </View>
        </View>

        <View style={s.footer} fixed>
          {vm.footerColumns.map((col, i) => (
            <Text key={i} style={s.footerCol}>
              {compact ? oneLine(col) : col}
            </Text>
          ))}
        </View>
        <Text style={s.pageNumber} fixed render={({ pageNumber, totalPages }) => `Seite ${pageNumber} von ${totalPages}`} />
      </Page>
    </Document>
  )
}

