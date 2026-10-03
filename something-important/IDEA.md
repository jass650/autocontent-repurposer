# something-important: the idea

**Working name: TwoCents.** One cent makes us happy for a moment. Then we want two.

## The pitch
One marketplace where **everybody and everything for sale is the same**. There's no "business side" and no "customer side". Everyone has the same kind of account, and everyone is trying to make that dollar. Sell a thing, sell your time, or sell space on a billboard.

## What's for sale
| Type | Examples | Priced |
| --- | --- | --- |
| **Stuff** | Used gear, handmade goods, weird finds, bulk lots | per item |
| **Services** | Lawn care, logo design, moving help, tutoring, odd jobs | per hour / per job |
| **Billboards** (the big one) | Roadside boards, digital screens, storefront windows, truck wraps, even yard signs | per week |

Billboards get their own booking flow: pick a start week and a length, see which weeks are already booked, and pay.

## How we make money: the penny engine
1. **Transaction cut:** we keep **3% + 2¢** of every sale, taken from the seller's payout. Buyers always pay the listed price.
2. **On-site billboards:** the platform itself is a billboard. Sellers buy ad slots by the day.
   - **Hero board** (top of the home page): $5/day
   - **Side boards** (sponsored listings): $1/day
3. **The Penny Jar:** a public page that counts every cent the platform has made, live. It's transparent, and it keeps us hungry.

Later, more ways to earn: featured listings, a verified-seller badge, instant payouts for a small fee, and billboard design add-ons.

## Principles
- **One account type.** Everyone can buy and sell.
- **Integer cents everywhere.** Money is never a floating-point number.
- **"We sell what others won't."** We're the home for niche, odd and overlooked markets. The only limit is the law: no illegal goods or services, no weapons, no drugs, nothing stolen, no adult services. That keeps the lights on and the payment processor happy.

## Current status: working MVP
Run it:

```
cd app
npm start            # http://localhost:3100
```

Demo login: `demo@twocents.money` / `demo1234`, or click "Use the demo account".

**Screens:**
- **Home:** live billboard hero, the stuff, services and billboards sections, sponsored spots, and a Penny Jar ticker.
- **Browse:** filter by type and category, sort, search.
- **Listing:** buy for stuff (with quantity), hire for services (with hours), and book billboards with a week picker that blocks booked weeks.
- **Sell:** live preview and an "you keep $X, we keep Y¢" calculator.
- **Dashboard:** earnings, fees, listings (edit, pause, promote, delete), sales (mark done), purchases, ads, and profile.
- **Advertise:** a 14-day calendar for the hero board and side boards.
- **Penny Jar:** total revenue, a 14-day chart, and a live feed.
- **Also:** seller profiles, and log in / sign up.

**Code:**
- `server.js` is the API. All money is integer cents.
- `seed.js` holds 8 sellers, 22 listings, and past deals and ads.
- `public/` holds the frontend (`app.js`, `styles.css`).

**Tests:**
- `node test/smoke.mjs` runs the full buy, book, sell and advertise flow in headless Chrome. Add `WIDTH=390` to run it at phone width.
- `node test/overflow.mjs` checks that every screen fits a phone.

To start over with fresh sample data, delete `app/data/`.

**Next:**
- Real payments: Stripe Connect for seller payouts. Checkout is **simulated (test mode)** today.
- Photo uploads.
- Messaging between buyer and seller.
- Reviews.
- Featured-listing upsells.
