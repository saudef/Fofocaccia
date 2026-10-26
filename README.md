# FoFocaccia Tracker

Accounting dashboard for FoFocaccia: cashier and receipts (with the ZATCA e-invoice QR), orders, expenses with bill photos, daily / monthly / yearly views, item sales, P&L and cash, balance sheet, VAT, Zakat, customers, menu pricing and break-even, recipe costs, gathering boxes, ingredients, batch shopping lists, goals and wastage. One Excel export of everything.

There are no accounts. **Everyone who has the link works on the same live books**: a change saved on one phone appears on every other open screen within a second. Keep the link to the people who should be editing.

## How it is built

| File | What it is |
|------|------------|
| `index.html` | The whole dashboard: styles, views, calculations, receipts, Excel export |
| `store.js` | The shared store. Talks to Supabase (Postgres + realtime) and gives the page a tiny document API |
| `config.js` | Your Supabase URL and public key, and the business name |
| `supabase/schema.sql` | The one table everything is stored in, the rules that open it to the link, and the realtime switch |
| `assets/vendor/` | supabase-js, SheetJS (Excel), jsPDF and qrcodejs, vendored so nothing loads from a CDN |
| `.github/workflows/pages.yml` | Publishes the site to GitHub Pages on every push to `main` |

No build step. With `config.js` empty the page still runs, keeping data in the browser only (the header says so).

## Set up the shared database (once, about 10 minutes)

1. Create a free project at [supabase.com](https://supabase.com) (pick a region near you, e.g. Frankfurt).
2. In the project open **SQL editor**, paste the contents of `supabase/schema.sql` and run it.
3. Open **Project settings → API** and copy the **Project URL** and the **anon public** key into `config.js`.
4. Commit and push `config.js`. The anon key is designed to be public: together with `schema.sql` it lets anyone who has the page read and edit the books, which is the point. The page link is the only key, so share it only with the people who should be editing.

### If you later want accounts

The first version of this repository (commit `12b9241`) had an email-and-password sign-in with the table locked to signed-in users. It can be brought back by restoring `store.js`, `config.js` and `supabase/schema.sql` from that commit.

## Publish it

Push to `main` and the workflow in `.github/workflows/pages.yml` deploys the site. Turn Pages on once under **Settings → Pages → Source: GitHub Actions**. The address is `https://<your-user>.github.io/fofocaccia-tracker/`. Pages on a private repository needs a paid GitHub plan; on a public one it is free, and nothing sensitive lives in the repository (the data is in Supabase, behind the sign-in).

Receipt links sent to customers (`#v~…`) carry the whole receipt inside the link, so a customer sees only their receipt and never the books.

## Run it locally

```bash
python3 -m http.server 8080   # then open http://localhost:8080
```

## Backups

Settings → **Copy backup JSON** copies everything; **Import backup** restores it. The Excel button in the header downloads a workbook with every sheet. In Supabase, **Database → Backups** keeps daily backups on paid plans; on the free plan use the JSON backup now and then.
