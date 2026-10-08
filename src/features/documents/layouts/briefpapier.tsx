import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { Theme } from '@/lib/domain/theme'
import type { InvoiceViewModel } from '@/lib/domain/view-model'
import { din5008, mm } from '../din5008'
import type { DocumentLogo } from '../logo'

type Props = { vm: InvoiceViewModel; theme: Theme; fontFamily: string; logo?: DocumentLogo | null }

const PAGE_WIDTH_MM = 210

/**
 * Layout "Briefpapier": modelled on the business's own Word invoice (spec 9a). The head carries only the logo,
 * no footer, items as single lines. Displays view-model strings only, no calculations.
 */
export function BriefpapierInvoice({ vm, theme, fontFamily, logo }: Props) {
  const din = din5008(theme.page.din5008)
  const { page } = theme
  const c = theme.colors
  const base = theme.font.baseSizePt
  const contentWidthMm = PAGE_WIDTH_MM - page.marginLeftMm - page.marginRightMm
  // Template: date right-aligned at the bottom edge of the address field, title about 22 mm below it.
  const dateTopMm = din.addressTopMm + din.addressHeightMm - 4
  const bodyTopMm = din.addressTopMm + din.addressHeightMm + 22

  const logoWidthMm = theme.logo.widthMm
  const logoHeightMm = logo ? (logoWidthMm * logo.height) / logo.width : 0
  const logoLeftMm =
    theme.logo.position === 'links'
      ? page.marginLeftMm
      : theme.logo.position === 'mitte'
        ? (PAGE_WIDTH_MM - logoWidthMm) / 2
        : PAGE_WIDTH_MM - page.marginRightMm - logoWidthMm

  const s = StyleSheet.create({
    page: {
      fontFamily,
      fontSize: base,
      color: c.text,
      paddingTop: mm(page.marginTopMm),
      paddingRight: mm(page.marginRightMm),
      paddingBottom: mm(page.marginBottomMm) + mm(8),
      paddingLeft: mm(page.marginLeftMm),
    },
    // react-pdf 4.9: no lineHeight on <Page>, and containers with a lineHeight also set their fontSize (M7).
    content: { fontSize: base, lineHeight: 1.35 },
    head: { height: mm(bodyTopMm - page.marginTopMm) },
    logo: { position: 'absolute', top: mm(page.marginTopMm), left: mm(logoLeftMm), width: mm(logoWidthMm), height: mm(logoHeightMm) },
    address: {
      position: 'absolute',
      top: mm(din.addressTopMm),
      // Template aligns the address with the body text (left margin) – still inside the DIN window (20–110 mm).
      left: mm(page.marginLeftMm),
      width: mm(din.addressWidthMm - (page.marginLeftMm - din.addressLeftMm)),
      height: mm(din.addressHeightMm),
      fontSize: base,
      lineHeight: 1.35,
    },
    endorsement: { height: mm(din.endorsementZoneMm), justifyContent: 'flex-end', paddingBottom: mm(1) },
    senderLine: { fontSize: 7, color: c.primary, textDecoration: 'underline' },
    date: { position: 'absolute', top: mm(dateTopMm), right: mm(page.marginRightMm), fontSize: base },
    title: { fontSize: base + 1, fontWeight: 700, color: c.primary, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: mm(6) },
    numberRow: { flexDirection: 'row', gap: mm(12) },
    note: { marginTop: mm(1) },
    paragraph: { marginTop: mm(6) },
    items: { marginTop: mm(14) },
    row: { flexDirection: 'row', justifyContent: 'space-between', gap: mm(6) },
    rowText: { flexGrow: 1, flexShrink: 1 },
    amount: { width: mm(30), textAlign: 'right' },
    grandTotal: { flexDirection: 'row', justifyContent: 'space-between', marginTop: mm(8), fontWeight: 700, color: c.primary },
    taxes: { marginTop: mm(8), width: mm(contentWidthMm * 0.75) },
    payment: { marginTop: mm(16) },
    banks: { marginTop: mm(4) },
    bank: { flexDirection: 'row', marginBottom: mm(4) },
    bankName: { width: mm(50), paddingRight: mm(3) },
    bankRow: { flexDirection: 'row' },
    bankLabel: { width: mm(20) },
    pageNumber: { position: 'absolute', bottom: mm(page.marginBottomMm) - 10, left: mm(page.marginLeftMm), right: mm(page.marginRightMm), textAlign: 'right', fontSize: 7, color: c.primary },
  })

  return (
    <Document title={`${vm.title} ${vm.number}`.trim()} author={vm.companyName} language="de">
      <Page size="A4" style={s.page}>
        {/* Head: only the logo, on every page – like the business's letterhead. */}
        {/* react-pdf's Image draws into the PDF and has no alt attribute (not an HTML <img>). */}
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        {logo && <Image fixed style={s.logo} src={{ data: logo.data, format: logo.type }} />}

        <View style={s.address}>
          <View style={s.endorsement}>{page.senderLine && vm.senderLine !== '' && <Text style={s.senderLine}>{vm.senderLine}</Text>}</View>
          {vm.recipientLines.map((line, i) => (
            <Text key={i}>{line}</Text>
          ))}
        </View>
        <Text style={s.date}>{vm.issueDate}</Text>

        <View style={s.content}>
          <View style={s.head} />
          <Text style={s.title}>{vm.title}</Text>
          <View style={s.numberRow}>
            <Text>{vm.number}</Text>
            {vm.taxIdLine !== '' && <Text>{vm.taxIdLine}</Text>}
          </View>
          {vm.recipientVatId && <Text style={s.note}>Ihre USt-IdNr.: {vm.recipientVatId}</Text>}
          <Text style={s.note}>{vm.serviceDateNote}</Text>
          {vm.intro !== '' && <Text style={s.paragraph}>{vm.intro}</Text>}

          <View style={s.items}>
            {vm.items.map((item) => (
              <View key={item.position} style={s.row} wrap={false}>
                <Text style={s.rowText}>{item.line}</Text>
                <Text style={s.amount}>{item.total}</Text>
              </View>
            ))}
          </View>

          <View wrap={false}>
            <View style={s.grandTotal}>
              <Text>Gesamtbetrag brutto</Text>
              <Text style={s.amount}>{vm.totals.gross}</Text>
            </View>
            <View style={s.taxes}>
              {vm.taxGroups.map((g) => (
                <View key={g.rate}>
                  <View style={s.row}>
                    <Text>davon {g.rate} USt</Text>
                    <Text style={s.amount}>{g.vat}</Text>
                  </View>
                  <View style={s.row}>
                    <Text>Rechnungsbetrag netto</Text>
                    <Text style={s.amount}>{g.net}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={s.payment} wrap={false}>
            {vm.paymentNote !== '' && <Text>{vm.paymentNote}</Text>}
            {vm.bankAccounts.length > 0 && (
              <View style={s.banks}>
                {vm.bankAccounts.map((b, i) => (
                  <View key={i} style={s.bank}>
                    <Text style={s.bankName}>{b.bank}</Text>
                    <View>
                      {b.rows.map(([label, value]) => (
                        <View key={label} style={s.bankRow}>
                          <Text style={s.bankLabel}>{label}</Text>
                          <Text>{value}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
          {vm.closing !== '' && <Text style={s.paragraph}>{vm.closing}</Text>}
        </View>

        {/* Page number only for multi-page invoices (the template has none). */}
        <Text style={s.pageNumber} fixed render={({ pageNumber, totalPages }) => (totalPages > 1 ? `Seite ${pageNumber} von ${totalPages}` : '')} />
      </Page>
    </Document>
  )
}
