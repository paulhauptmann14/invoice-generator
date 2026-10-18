import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { DOCUMENT_COLORS, readableTextOn, type Theme } from '@/lib/domain/theme'
import type { InvoiceViewModel } from '@/lib/domain/view-model'
import { din5008, mm } from '../din5008'
import type { DocumentLogo } from '../logo'
import { modernHead } from './modern-metrics'

type Props = { vm: InvoiceViewModel; theme: Theme; fontFamily: string; logo?: DocumentLogo | null }

/**
 * Layout "Modern" (spec 3d): large company name in the primary color, an accent rule, DIN 5008 address field,
 * info as label/value pairs, plain rows, the gross total in an accent band, a small muted footer.
 * Displays view-model strings only, no calculations.
 */
export function ModernInvoice({ vm, theme, fontFamily, logo }: Props) {
  const din = din5008(theme.page.din5008)
  const { page } = theme
  const c = theme.colors
  const base = theme.font.baseSizePt
  const head = modernHead(theme, logo ?? null, vm.companyName)
  const bodyTopMm = din.addressTopMm + din.addressHeightMm + 8.46

  const s = StyleSheet.create({
    page: {
      fontFamily,
      fontSize: base,
      color: c.text,
      paddingTop: mm(page.marginTopMm),
      paddingRight: mm(page.marginRightMm),
      paddingBottom: mm(page.marginBottomMm) + mm(18),
      paddingLeft: mm(page.marginLeftMm),
    },
    // See "Klassisch": containers with a lineHeight also set their fontSize (react-pdf 4.9).
    content: { fontSize: base, lineHeight: 1.35 },
    head: { height: mm(bodyTopMm - page.marginTopMm) },
    companyName: { fontSize: head.nameSizePt, fontWeight: 700, color: c.primary, lineHeight: 1.1, maxWidth: mm(head.nameWidthMm) },
    rule: {
      position: 'absolute',
      top: mm(head.ruleTopMm),
      left: mm(page.marginLeftMm),
      right: mm(page.marginRightMm),
      borderTopWidth: 1.5,
      borderTopColor: c.accent,
    },
    logo: { position: 'absolute', top: mm(page.marginTopMm), right: mm(page.marginRightMm), width: mm(head.logoWidthMm), height: mm(head.logoHeightMm) },
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
    senderLine: { fontSize: 7, color: c.primary },
    info: {
      position: 'absolute',
      top: mm(din.infoTopMm),
      right: mm(page.marginRightMm),
      width: mm(72),
      flexDirection: 'row',
      flexWrap: 'wrap',
      rowGap: mm(2.5),
    },
    infoPair: { width: '50%', fontSize: base, lineHeight: 1.3 },
    infoLabel: { fontSize: 7, color: DOCUMENT_COLORS.muted },
    title: { fontSize: theme.font.headingSizePt, fontWeight: 700, color: c.primary, lineHeight: 1.1, marginBottom: mm(5) },
    titleNumber: { fontWeight: 400 },
    paragraph: { marginBottom: mm(5) },
    table: { marginBottom: mm(3) },
    th: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: c.primary, fontWeight: 700, color: c.primary },
    tr: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: DOCUMENT_COLORS.rule },
    colPos: { width: '7%' },
    colDesc: { flexGrow: 1, flexBasis: 0, paddingRight: 6 },
    colQty: { width: '9%', textAlign: 'right' },
    colUnit: { width: '9%', paddingLeft: 8 },
    colPrice: { width: '15%', textAlign: 'right' },
    colVat: { width: '9%', textAlign: 'right' },
    colTotal: { width: '15%', textAlign: 'right' },
    totals: { marginLeft: 'auto', width: '50%' },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1.5, paddingHorizontal: 6 },
    grandTotal: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 4,
      paddingVertical: 5,
      paddingHorizontal: 6,
      backgroundColor: c.accent,
      color: readableTextOn(c.accent),
      fontWeight: 700,
      fontSize: base + 1.5,
    },
    noteBeforeBanks: { marginBottom: mm(1.5) },
    banks: { marginBottom: mm(5) },
    bankRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: mm(4) },
    bankName: { fontWeight: 700 },
    closingBlock: { marginTop: mm(8) },
    footer: {
      position: 'absolute',
      bottom: mm(page.marginBottomMm),
      left: mm(page.marginLeftMm),
      right: mm(page.marginRightMm),
      borderTopWidth: 0.5,
      borderTopColor: DOCUMENT_COLORS.rule,
      paddingTop: 4,
      flexDirection: 'row',
      gap: 8,
      fontSize: 6.5,
      lineHeight: 1.4,
      color: DOCUMENT_COLORS.muted,
    },
    footerCol: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto' },
    pageNumber: {
      position: 'absolute',
      bottom: mm(page.marginBottomMm) - 14,
      left: mm(page.marginLeftMm),
      right: mm(page.marginRightMm),
      textAlign: 'right',
      fontSize: 6.5,
      color: DOCUMENT_COLORS.muted,
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

        {/* react-pdf's Image draws into the PDF and has no alt attribute (not an HTML <img>). */}
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        {logo && <Image style={s.logo} src={{ data: logo.data, format: logo.type }} />}
        <View style={s.rule} />

        <View style={s.address}>
          <View style={s.endorsement}>{page.senderLine && vm.senderLine !== '' && <Text style={s.senderLine}>{vm.senderLine}</Text>}</View>
          {vm.recipientLines.map((line, i) => (
            <Text key={i}>{line}</Text>
          ))}
        </View>

        <View style={s.info}>
          {info.map(([label, value]) => (
            <View key={label} style={s.infoPair}>
              <Text style={s.infoLabel}>{label}</Text>
              <Text>{value}</Text>
            </View>
          ))}
        </View>

        <View style={s.content}>
          {/* Its height reserves the head/address area so the body always starts below it. */}
          <View style={s.head}>
            <Text style={s.companyName}>{vm.companyName}</Text>
          </View>

          <Text style={s.title}>
            {vm.title}
            {vm.number !== '' && <Text style={s.titleNumber}> {vm.number}</Text>}
          </Text>
          {vm.intro !== '' && <Text style={s.paragraph}>{vm.intro}</Text>}

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
            {vm.items.map((item) => (
              <View key={item.position} style={s.tr} wrap={false}>
                {t.showPosition && <Text style={s.colPos}>{item.position}</Text>}
                <Text style={s.colDesc}>{item.description}</Text>
                <Text style={s.colQty}>{item.quantity}</Text>
                {t.showUnit && <Text style={s.colUnit}>{item.unit}</Text>}
                <Text style={s.colPrice}>{item.unitPrice}</Text>
                {t.showVatRate && <Text style={s.colVat}>{item.vatRate}</Text>}
                <Text style={s.colTotal}>{item.total}</Text>
              </View>
            ))}
          </View>

          <View style={s.totals} wrap={false}>
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
              {col}
            </Text>
          ))}
        </View>
        <Text style={s.pageNumber} fixed render={({ pageNumber, totalPages }) => `Seite ${pageNumber} von ${totalPages}`} />
      </Page>
    </Document>
  )
}
