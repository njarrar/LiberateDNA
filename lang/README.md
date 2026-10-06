# Translations

Each language is one XML file in this folder. LiberateDNA bundles every file here when it
is built, and the language appears in the switcher.

```xml
<language code="fr" name="Français" english-name="French" dir="ltr" locale="fr-FR">
  <entry>
    <source>Explore your DNA without sharing it</source>
    <translation>Explorez votre ADN sans le partager</translation>
  </entry>
</language>
```

| Attribute | Meaning |
|---|---|
| `code` | Language code, such as `fr`, `ar` or `pt-BR`. The file name should match: `fr.xml`. |
| `name` | The language's name in that language, shown in the switcher. |
| `english-name` | The name in English. |
| `dir` | `rtl` for languages written right to left (Arabic, Hebrew, Persian, Urdu). The whole layout mirrors. Otherwise `ltr`. |
| `locale` | Used for dates, such as `fr-FR`. Add `-u-nu-latn` to keep Western digits. |
| `list-separator` | Optional. What goes between items in a list, if not `, `. |
| `font` | Optional. A Google Fonts family to load for scripts the default fonts lack, such as `IBM Plex Sans Arabic`. |

## Rules for entries

- `source` is the English text exactly as the app shows it. Do not change it.
- `{0}`, `{1}` and so on stand for values the app fills in: numbers, names, file names.
  Keep each one, but move it wherever your language needs it.
- Leave gene names (APOE, CYP2C19), marker names (rs4988235), variant names (M694V) and
  haplogroups (J1c, R-M269) as they are.
- An empty `translation` falls back to English, so a partial file still works.
- Health text should stay as careful as the English: do not make a result sound more or
  less certain than it is.

## Add a language

1. Copy `en.xml` to `xx.xml`, using your language code.
2. Change the attributes on the `<language>` line.
3. Fill in each `<translation>`.
4. Try it before you send it: open LiberateDNA, choose **Load a translation file** under
   Language, and pick your file. It is used in your browser only.
5. Open a pull request with the new file. The page is rebuilt with `python3 src/build.py index.html`.

## Fix a translation

Edit the `<translation>` in the right file and open a pull request.

## When the English text changes

`tests/i18n-collect.js` visits every screen, writes all the English text it finds to
`en.xml`, and adds any new entries, empty, to the other files. Serve the repository root
on port 8765 (`python3 -m http.server 8765`) and run `node tests/i18n-collect.js`.
