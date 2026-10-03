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

## Current status (work in progress)
**Done in `app/`:**
- `server.js`: the full backend API.
  - Accounts and listings (stuff, services, billboards)
  - Buying, hiring, and billboard week booking with conflict checks
  - On-site ad slots (hero $5/day, side $1/day) and the seller dashboard
  - Penny Jar stats, and the 3% + 2¢ fee in integer cents
- `seed.js`: 8 sample sellers, 22 listings, past deals and ads.
- `public/index.html`, `styles.css`, `coin.svg`: page shell and full styling.
- Demo login: `demo@twocents.money` / `demo1234`. Start with `npm start` in `app/` (port 3100).

**Still to do:**
- **Write `public/app.js`.** This is the single-page frontend. Its routes are:
  - `/`: billboard hero, plus the stuff, services and billboards sections
  - `/browse`
  - `/l/:id`: buy box, billboard week picker
  - `/sell`
  - `/me`: dashboard
  - `/advertise`: 14-day ad calendar
  - `/jar`
  - `/u/:id`
  - `/login` and `/signup`

  The CSS classes for all of these already exist in `styles.css`.
- Payments are **simulated (test mode)**. After that, real payments: Stripe Connect for seller payouts.
