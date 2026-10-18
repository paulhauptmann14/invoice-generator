'use client'

import { PreviewToggle, usePreviewMode, WithPreview } from '@/features/invoices/with-preview'
import { useTenant } from '@/features/tenants/tenant-context'
import { BUILTIN_FONTS } from '@/lib/domain/theme'
import { saveAppearanceSettings } from './actions'
import { CheckboxField, ColorField, ErrorSummary, RadioField, SaveBar, SelectField, TextAreaField, TextField } from './fields'
import { LogoField } from './logo-field'
import { type AppearanceFormInput, appearanceFormSchema } from './schemas'
import { useSettingsForm } from './use-settings-form'

const legend = 'font-display text-xl font-semibold'
const placeholders = 'Platzhalter: {Nr}, {Kunde}, {Datum}, {Leistungsdatum}, {Faellig}, {Betrag}'

const LAYOUT_OPTIONS = [
  { value: 'briefpapier', label: 'Briefpapier', description: 'Wie die eigene Word-Rechnung: Kopf nur mit Logo, Positionen als Zeilen, keine Fußzeile.' },
  { value: 'klassisch', label: 'Klassisch', description: 'Positionstabelle mit Spaltenköpfen, Fußzeile mit Firmenangaben.' },
  { value: 'kompakt', label: 'Kompakt', description: 'Wie Klassisch, aber dichter gesetzt – für lange Rechnungen mit vielen Positionen.' },
  { value: 'modern', label: 'Modern', description: 'Großer Firmenname, Linie und Gesamtbetrag in der Akzentfarbe, Logo oben rechts.' },
] as const

const POSITIONS = [
  { value: 'links', label: 'Links' },
  { value: 'mitte', label: 'Mitte' },
  { value: 'rechts', label: 'Rechts' },
] as const

const DIN_FORMS = [
  { value: 'B', label: 'Form B (Anschrift tiefer, häufiger)' },
  { value: 'A', label: 'Form A (Anschrift höher)' },
] as const

const TABLE_LABELS = [
  ['position', 'Positionsnummer'],
  ['description', 'Beschreibung'],
  ['quantity', 'Menge'],
  ['unit', 'Einheit'],
  ['unitPrice', 'Einzelpreis'],
  ['vatRate', 'Steuersatz'],
  ['total', 'Gesamt'],
] as const

export function AppearanceForm({ initial, logo }: { initial: AppearanceFormInput; logo: { present: boolean; version: string } }) {
  const { tenant, api } = useTenant()
  const form = useSettingsForm({ initial, schema: appearanceFormSchema, action: saveAppearanceSettings.bind(null, tenant.id) })
  const preview = usePreviewMode('einstellungen-vorschau')
  const previewUrl = api('settings/preview')
  const previewPayload = JSON.stringify({ tab: 'erscheinungsbild', form: form.draft })
  const { layout } = form.draft
  // Table layouts share colors, columns and footer; only some parts differ (spec 3d).
  const tableLayout = layout !== 'briefpapier'
  const hasLogo = layout === 'briefpapier' || layout === 'modern'

  return (
    <WithPreview mode={preview} url={previewUrl} payload={previewPayload}>
      <form action={form.formAction} noValidate className="space-y-10">
        <input type="hidden" name="payload" value={form.payload} />
        <ErrorSummary form={form} />
        <div className="flex justify-end">
          <PreviewToggle mode={preview} url={previewUrl} payload={previewPayload} />
        </div>

        <fieldset className="space-y-4">
          <legend className={legend}>Layout</legend>
          <RadioField form={form} path="layout" label="Aufbau der Rechnung" options={LAYOUT_OPTIONS} />
        </fieldset>

        <fieldset className="space-y-5">
          <legend className={legend}>Logo</legend>
          {!hasLogo && <p className="text-sm text-muted-foreground">Das Layout {layout === 'kompakt' ? 'Kompakt' : 'Klassisch'} druckt kein Logo.</p>}
          <LogoField hasLogo={logo.present} version={logo.version} />
          <div className="grid gap-5 @lg:grid-cols-2">
            {/* "Modern" always places the logo top right. */}
            {layout === 'briefpapier' && <SelectField form={form} path="logo.position" label="Position" options={POSITIONS} />}
            <TextField form={form} path="logo.widthMm" label="Breite (mm)" inputMode="decimal" autoComplete="off" hint="10 bis 120 mm" />
          </div>
        </fieldset>

        <fieldset className="space-y-5">
          <legend className={legend}>Schrift</legend>
          <SelectField form={form} path="font.builtin" label="Schriftart" options={BUILTIN_FONTS.map((f) => ({ value: f, label: f }))} />
          <div className="grid gap-5 @lg:grid-cols-2">
            <TextField form={form} path="font.baseSizePt" label="Größe Fließtext (pt)" inputMode="decimal" autoComplete="off" hint="7 bis 14 pt" />
            {tableLayout && <TextField form={form} path="font.headingSizePt" label="Größe Überschrift (pt)" inputMode="decimal" autoComplete="off" hint="10 bis 28 pt" />}
          </div>
        </fieldset>

        <fieldset className="space-y-5">
          <legend className={legend}>Seite</legend>
          <div className="grid gap-5 @md:grid-cols-2 @3xl:grid-cols-4">
            <TextField form={form} path="page.marginTopMm" label="Rand oben (mm)" inputMode="decimal" autoComplete="off" />
            <TextField form={form} path="page.marginRightMm" label="Rand rechts (mm)" inputMode="decimal" autoComplete="off" />
            <TextField form={form} path="page.marginBottomMm" label="Rand unten (mm)" inputMode="decimal" autoComplete="off" />
            <TextField form={form} path="page.marginLeftMm" label="Rand links (mm)" inputMode="decimal" autoComplete="off" />
          </div>
          <SelectField form={form} path="page.din5008" label="Anschriftfeld (DIN 5008)" options={DIN_FORMS} hint="Muss zum Fensterkuvert passen." />
          <CheckboxField form={form} path="page.senderLine" label="Absenderzeile über der Anschrift" hint="Firmenname und Anschrift klein über dem Empfänger, sichtbar im Fenster." />
        </fieldset>

        <fieldset className="space-y-5">
          <legend className={legend}>Texte</legend>
          <TextField form={form} path="texts.title" label="Titel" autoComplete="off" className="max-w-sm" />
          <TextAreaField form={form} path="texts.intro" label="Einleitung" hint="Vorbelegung für neue Rechnungen." />
          <TextAreaField form={form} path="texts.closing" label="Schlusstext" hint={`Vorbelegung für neue Rechnungen. ${placeholders}`} />
          {layout === 'briefpapier' && (
            <>
              <TextField
                form={form}
                path="texts.serviceDateNoteSame"
                label="Satz, wenn Leistungsdatum = Rechnungsdatum"
                autoComplete="off"
                hint="Leer lassen, um den Satz wegzulassen. Das Leistungsdatum ist Pflichtangabe – außer bei Kleinbetragsrechnungen bis 250 €."
              />
              <TextField
                form={form}
                path="texts.serviceDateNoteOther"
                label="Satz bei abweichendem Leistungsdatum"
                autoComplete="off"
                hint="Platzhalter {Leistungsdatum} setzt das Datum oder den Zeitraum ein. Leer lassen, um den Satz wegzulassen."
              />
            </>
          )}
        </fieldset>

        {tableLayout && (
          <>
            <fieldset className="space-y-5">
              <legend className={legend}>Farben</legend>
              <div className="grid gap-5 @lg:grid-cols-3">
                <ColorField form={form} path="colors.primary" label={layout === 'modern' ? 'Firmenname und Überschriften' : 'Überschriften und Linien'} />
                <ColorField form={form} path="colors.text" label="Text" />
                {layout === 'klassisch' && <ColorField form={form} path="colors.tableHeaderBg" label="Tabellenkopf" />}
                {layout === 'modern' && <ColorField form={form} path="colors.accent" label="Akzent (Linie und Gesamtbetrag)" />}
              </div>
              {layout === 'modern' ? (
                <p className="text-sm text-muted-foreground">Die Schrift auf dem Gesamtbetrag wird automatisch hell oder dunkel gesetzt, damit sie lesbar bleibt.</p>
              ) : (
                <CheckboxField form={form} path="colors.zebra" label="Positionen abwechselnd hinterlegen" />
              )}
            </fieldset>

            <fieldset className="space-y-5">
              <legend className={legend}>Tabelle</legend>
              <div>
                <CheckboxField form={form} path="table.showPosition" label="Spalte Positionsnummer" />
                <CheckboxField form={form} path="table.showUnit" label="Spalte Einheit" />
                <CheckboxField form={form} path="table.showVatRate" label="Spalte Steuersatz" />
              </div>
              <div className="grid gap-5 @lg:grid-cols-2 @3xl:grid-cols-4">
                {TABLE_LABELS.map(([key, label]) => (
                  <TextField key={key} form={form} path={`table.labels.${key}`} label={`Spaltenkopf ${label}`} autoComplete="off" />
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-5">
              <legend className={legend}>Fußzeile</legend>
              <p className="text-sm text-muted-foreground">Bis zu vier Spalten. Alle leer = Fußzeile automatisch aus den Firmendaten.</p>
              <div className="grid gap-5 @lg:grid-cols-2">
                {[0, 1, 2, 3].map((i) => (
                  <TextAreaField key={i} form={form} path={`texts.footerColumns.${i}`} label={`Spalte ${i + 1}`} rows={3} />
                ))}
              </div>
            </fieldset>
          </>
        )}

        <SaveBar form={form} />
      </form>
    </WithPreview>
  )
}
