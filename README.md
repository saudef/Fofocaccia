# FoFocaccia Tracker

Accounting dashboard for FoFocaccia: cashier and receipts (with the ZATCA e-invoice QR), orders, expenses with bill photos, daily / monthly / yearly views, item sales, P&L and cash, balance sheet, VAT, Zakat, customers, menu pricing and break-even, recipe costs, gathering boxes, ingredients, batch shopping lists, goals and wastage. One Excel export of everything.

Everyone who signs in works on the **same live books**: a change saved on one phone appears on every other open screen within a second.

## How it is built

| File | What it is |
|------|------------|
| `index.html` | The whole dashboard: styles, views, calculations, receipts, Excel export |
| `store.js` | Sign-in screen and the shared store. Talks to Supabase (login + Postgres + realtime) and gives the page a tiny document API |
| `config.js` | Your Supabase URL and public key, plus `ALLOW_SIGNUP` and the business name |
| `supabase/schema.sql` | The one table everything is stored in, its access rules and the realtime switch |
| `supabase/web-orders.sql` | The one extra rule that lets the website drop web orders into that table |
| `assets/vendor/` | supabase-js, SheetJS (Excel), jsPDF and qrcodejs, vendored so nothing loads from a CDN |
| `.github/workflows/pages.yml` | Publishes the site to GitHub Pages on every push to `main` |

No build step. With `config.js` empty the page still runs, keeping data in the browser only (the header says so).

## Set up the shared database (once, about 10 minutes)

1. Create a free project at [supabase.com](https://supabase.com) (pick a region near you, e.g. Frankfurt).
2. In the project open **SQL editor**, paste the contents of `supabase/schema.sql` and run it.
3. Open **Project settings → API** and copy the **Project URL** and the **anon public** key into `config.js`.
4. Open **Authentication → URL configuration** and set the **Site URL** to the address the tracker is served from (the GitHub Pages address below). Add it to **Redirect URLs** as well. This is where confirmation and password-reset emails send people.
5. Commit and push `config.js`. The anon key is designed to be public; the rules in `schema.sql` are what protect the data (only signed-in users can read or write, nobody else can read anything).

### Who can sign in

By default anyone who finds the page can create an account and then edit the books. To keep it to your team:

- Supabase → **Authentication → Providers → Email**: turn **Allow new users to sign up** off.
- Set `ALLOW_SIGNUP: false` in `config.js` to hide the "Create an account" button.
- Add people yourself under **Authentication → Users → Invite user**. They get an email, set a password, and sign in.

Email confirmation is on by default in Supabase. If you'd rather people sign in immediately after creating an account, turn **Confirm email** off on the same Email provider page.

## Web orders from the website

The FoFocaccia website hands each order to this dashboard the moment a customer taps "Send order on WhatsApp": it writes `weborders/<reference>` into the same `docs` table, and the **🌐 Web orders** tab shows it live with the items, prices, customer, delivery or pickup, date and notes. **Accept → new order** opens the normal order form prefilled (menu items matched by name, anything unknown as a custom item), so receipts, VAT and customer memory work as usual; the web order is then marked accepted with the receipt number. **Dismiss** keeps it under Handled. The WhatsApp message remains the order; this is your copy of it.

A web order can carry the customer's National Address (short address); the card shows it with a map link, and Accept copies it into the order notes. The optional lookup that turns the code into a full address for the website lives in `supabase/functions/national-address/` (needs a key from api.address.gov.sa; see the website repository's `integration/national-address/README.md`).

Setup, once: run `supabase/web-orders.sql` in Supabase → SQL editor. It adds one rule: anonymous visitors (the website, using the public key) may *insert* a row whose path starts with `weborders/FF-`, a small JSON object, and nothing else. They cannot read, change or delete anything. Remove the rule to switch the hand-off off.

## Publish it

Push to `main` and the workflow in `.github/workflows/pages.yml` deploys the site. Turn Pages on once under **Settings → Pages → Source: GitHub Actions**. The address is `https://<your-user>.github.io/fofocaccia-tracker/`. Pages on a private repository needs a paid GitHub plan; on a public one it is free, and nothing sensitive lives in the repository (the data is in Supabase, behind the sign-in).

Receipt links sent to customers (`#v~…`) carry the whole receipt inside the link, so they open without signing in.

## Run it locally

```bash
python3 -m http.server 8080   # then open http://localhost:8080
```

Sign-in needs the page to be served over http(s), not opened as a file, because the Supabase client stores the session for the page's origin.

## Backups

Settings → **Copy backup JSON** copies everything; **Import backup** restores it. The Excel button in the header downloads a workbook with every sheet. In Supabase, **Database → Backups** keeps daily backups on paid plans; on the free plan use the JSON backup now and then.

## Saudi VAT / ZATCA behaviour

- VAT is charged only on orders dated on or after **Settings → VAT applies from** (the date on the VAT certificate). Earlier orders and quarters carry no VAT and need no return.
- The delivery fee carries VAT (KSA treats a seller's delivery charge as part of the supply). Switch it off under Settings → Business & VAT if your accountant advises otherwise.
- Receipts are bilingual **simplified tax invoices** with the seller's VAT and CR numbers, address, date and time, a Code128 barcode and the ZATCA phase-1 QR. Add a buyer VAT number on the order to issue a full **tax invoice**.
- Issued invoices are locked. To cancel or correct one, open its receipt and press **Issue credit note**: a numbered `CN-…` note reverses it in full, then record a corrected order.
- Records must be kept for 6 years. The dashboard warns when no backup has been taken for 30 days; Copy backup JSON and the Excel export both count as a backup.
