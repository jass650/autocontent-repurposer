'use strict';
// Sample marketplace so nothing is ever empty. All money is integer cents.
const crypto = require('crypto');

const id = () => crypto.randomBytes(6).toString('hex');
const DAY = 864e5;

function mondayOf(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
function addWeeks(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d.toISOString().slice(0, 10);
}
const isoDay = (offset = 0) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);

const PEOPLE = [
  ['Jordan Miles', 'Austin, TX', 'Selling whatever I can find. Billboard on 183 is my baby.'],
  ['Rosa Delgado', 'San Antonio, TX', 'Landscaper, mom of 3, will mow anything.'],
  ['Dev Patel', 'Remote', 'Designer. Logos in 24h or your money back.'],
  ['Marcus Bell', 'Houston, TX', 'Box truck, strong back, fair prices.'],
  ['Kim Nguyen', 'Dallas, TX', 'Estate sale hunter. Weird stuff only.'],
  ['Big Lou Signs', 'Waco, TX', 'Family-owned outdoor advertising since 1987.'],
  ['Tasha Greene', 'Austin, TX', 'Coffee shop owner — my window is for rent.'],
  ['Eli Brooks', 'Round Rock, TX', 'I wait in lines so you don’t have to.'],
];

// [sellerIndex, kind, title, priceCents, unit, category, emoji, colors, description, extra]
const LISTINGS = [
  [5, 'billboard', 'Roadside bulletin — I-35 northbound, mile 331', 85000, 'week', 'Roadside', '🛣️', ['#1d3557', '#457b9d'], '14×48 ft bulletin facing northbound traffic between Waco and Temple. Lit at night. ~42,000 drivers a day. We print and install your vinyl (included).', { size: '14×48 ft', daily: 42000, lit: true }],
  [0, 'billboard', 'Digital screen — Hwy 183 & Lakeline', 42000, 'week', 'Digital', '📺', ['#0b090a', '#e5383b'], '10-second spot in an 8-advertiser rotation on a 20×10 LED board. Upload a JPG, live within 24 hours.', { size: '20×10 ft LED', daily: 28000, lit: true }],
  [6, 'billboard', 'Coffee shop window — South Congress', 6000, 'week', 'Storefront', '☕', ['#7f5539', '#ddb892'], 'Full-height front window on SoCo. 1,500+ walk-bys a day, tourists all weekend. You send the poster, I hang it.', { size: '6×8 ft', daily: 1500, lit: false }],
  [3, 'billboard', 'Box truck wrap — drives Houston daily', 30000, 'week', 'Mobile', '🚚', ['#2b9348', '#80b918'], '26 ft box truck, 9 hours a day across Houston on moving jobs. Magnetic side panels — your ad, both sides.', { size: '2 × 8×20 ft panels', daily: 20000, lit: false }],
  [7, 'billboard', 'Yard sign on the busiest corner in Round Rock', 1500, 'week', 'Roadside', '🪧', ['#ffb703', '#fb8500'], 'My corner lot sits at a 4-way stop next to the high school. Your 24×18 sign, on my lawn, seven days.', { size: '24×18 in', daily: 6000, lit: false }],
  [5, 'billboard', 'Poster panel — Waco Dr & 25th', 32000, 'week', 'Roadside', '🏙️', ['#3a0ca3', '#4cc9f0'], '12×24 poster panel at a signalized intersection. Great for local restaurants and lawyers.', { size: '12×24 ft', daily: 18000, lit: true }],

  [1, 'service', 'Lawn mowing + edging (up to 1/4 acre)', 4500, 'job', 'Home & yard', '🌿', ['#2d6a4f', '#95d5b2'], 'Mow, edge, blow. Same week. Bigger yards — message me.', null],
  [2, 'service', 'Logo design in 24 hours', 7500, 'job', 'Creative', '🎨', ['#7209b7', '#f72585'], 'Three concepts, two revisions, all files. Billboard-ready vectors included.', null],
  [3, 'service', 'Moving help — 2 people + truck', 9000, 'hour', 'Moving', '📦', ['#386641', '#a7c957'], 'Two-hour minimum. Blankets, dolly and straps included. Stairs fine.', null],
  [7, 'service', 'I’ll wait in line for you', 1800, 'hour', 'Errands', '⏳', ['#495057', '#adb5bd'], 'DMV, sneaker drops, brunch spots, concert merch. I text you updates, you show up at the front.', null],
  [2, 'service', 'Billboard artwork that people actually read', 15000, 'job', 'Creative', '🖼️', ['#ff006e', '#ffbe0b'], '7 words or fewer, big type, high contrast. Sized for any board on TwoCents.', null],
  [4, 'service', 'Estate sale pricing & cleanup', 3500, 'hour', 'Home & yard', '🧹', ['#6c584c', '#dde5b6'], 'I price it, stage it, sell it, and haul what’s left.', null],
  [0, 'service', 'Spreadsheet wizardry', 4000, 'hour', 'Business', '📊', ['#023e8a', '#48cae4'], 'Messy data in, clean dashboard out. Google Sheets or Excel.', null],
  [1, 'service', 'Dog walking — 30 minutes', 1500, 'job', 'Pets', '🐕', ['#bc6c25', '#fefae0'], 'Weekdays 10–3. Big dogs welcome. Photos every walk.', null],

  [4, 'item', 'Box of ~400 mismatched keys', 2500, 'each', 'Weird finds', '🗝️', ['#b08968', '#e6ccb2'], 'From a closed locksmith shop. Great for art, jewelry, or a very long afternoon.', { stock: 1 }],
  [4, 'item', 'Working vintage payphone', 18000, 'each', 'Weird finds', '☎️', ['#343a40', '#ced4da'], '1980s coin payphone with key. Rings, takes quarters. Heavy.', { stock: 1 }],
  [1, 'item', 'Fresh duck eggs — dozen', 900, 'each', 'Food', '🥚', ['#e9edc9', '#ccd5ae'], 'Pasture-raised, collected daily. Bakers love them.', { stock: 12 }],
  [0, 'item', 'Hand-painted “WE BUY GOLD” sign', 4000, 'each', 'Weird finds', '✍️', ['#ffd60a', '#ffc300'], '4×3 ft plywood, very sincere energy. Pick up only.', { stock: 1 }],
  [6, 'item', 'Bag of day-old pastries', 500, 'each', 'Food', '🥐', ['#f4a261', '#e9c46a'], 'Whatever didn’t sell today. Always good, never the same.', { stock: 8 }],
  [3, 'item', 'Moving boxes, used once — 30 pack', 2000, 'each', 'Home & yard', '📦', ['#a68a64', '#ede0d4'], 'Mixed sizes, clean, flattened. Tape not included.', { stock: 4 }],
  [7, 'item', 'Folding camp chair (the good kind)', 1500, 'each', 'Outdoors', '🪑', ['#588157', '#a3b18a'], 'Has a cup holder. Perfect for waiting in lines.', { stock: 3 }],
  [2, 'item', 'Sticker pack: “I sold it on TwoCents”', 300, 'each', 'Merch', '✨', ['#3a86ff', '#8338ec'], 'Ten vinyl stickers. Weatherproof. Brag responsibly.', { stock: 50 }],
];

const FEE = (cents) => Math.round(cents * 0.03) + 2;

function seed(hashPassword) {
  const now = Date.now();
  const users = PEOPLE.map(([name, location, bio], i) => {
    const { salt, hash } = hashPassword('demo1234');
    return { id: id(), name, email: `${name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/\.$/, '')}@example.com`, salt, hash, location, bio, createdAt: now - (60 - i) * DAY };
  });
  const listings = LISTINGS.map(([si, kind, title, price, unit, category, emoji, colors, description, extra], i) => ({
    id: id(), sellerId: users[si].id, kind, title, price, unit, category, emoji, colors, description, image: '',
    location: users[si].location, status: 'active', views: 40 + ((i * 37) % 400),
    stock: kind === 'item' ? extra?.stock ?? 1 : null,
    billboard: kind === 'billboard' ? { size: extra.size, daily: extra.daily, lit: extra.lit } : null,
    createdAt: now - (30 - i) * DAY,
  }));

  // Past deals so the Penny Jar and dashboards have history.
  const orders = [];
  const deal = (listingIdx, buyerIdx, daysAgo, opts = {}) => {
    const l = listings[listingIdx];
    const qty = opts.qty || 1;
    let subtotal = l.price * qty;
    let booking = null;
    if (l.kind === 'billboard') {
      const weeks = opts.weeks || 1;
      booking = { start: opts.start, weeks };
      subtotal = l.price * weeks;
    }
    const fee = FEE(subtotal);
    orders.push({
      id: id(), listingId: l.id, title: l.title, kind: l.kind, emoji: l.emoji, sellerId: l.sellerId, buyerId: users[buyerIdx].id,
      qty, subtotal, fee, payout: subtotal - fee, booking, note: opts.note || '', status: daysAgo > 3 ? 'completed' : 'paid',
      createdAt: now - daysAgo * DAY - (listingIdx * 3600e3) % DAY,
    });
  };
  const thisMon = mondayOf(new Date());
  deal(0, 4, 12, { start: addWeeks(thisMon, 1), weeks: 2 });
  deal(1, 2, 9, { start: thisMon, weeks: 1 });
  deal(1, 6, 5, { start: addWeeks(thisMon, 2), weeks: 3 });
  deal(2, 0, 8, { start: thisMon, weeks: 2 });
  deal(4, 1, 2, { start: addWeeks(thisMon, 1), weeks: 1 });
  deal(6, 0, 11); deal(6, 5, 6); deal(6, 4, 1);
  deal(7, 6, 10); deal(7, 0, 3);
  deal(8, 4, 7, { qty: 3 }); deal(9, 2, 4, { qty: 2 });
  deal(10, 5, 13); deal(13, 6, 2);
  deal(16, 2, 9, { qty: 2 }); deal(16, 3, 1);
  deal(18, 7, 6, { qty: 2 }); deal(18, 1, 0, { qty: 1 });
  deal(21, 0, 3, { qty: 4 }); deal(21, 4, 0, { qty: 2 });

  // On-site billboard ads (hero $5/day, side $1/day)
  const ads = [];
  const ad = (slot, dayOffset, userIdx, listingIdx, headline) => ads.push({
    id: id(), slot, date: isoDay(dayOffset), ownerId: users[userIdx].id, listingId: listings[listingIdx].id,
    headline, price: slot === 'hero' ? 500 : 100, createdAt: now - Math.max(1, -dayOffset + 1) * DAY,
  });
  for (let d = -10; d <= 0; d++) ad('side', d, 2, 7, 'Logos in 24h');
  ad('hero', -6, 5, 0, '42,000 drivers a day. Your name here.');
  ad('hero', -3, 3, 3, 'Your ad on a moving truck. Literally.');
  ad('hero', 0, 5, 0, 'Own I-35 for a week.');
  ad('hero', 1, 0, 1, 'Go big on 183. Book the LED.');
  ad('side', 0, 7, 9, 'I wait. You win.');
  ad('side', 0, 1, 6, 'Fresh-cut lawns, $45');
  ad('side', 1, 1, 6, 'Fresh-cut lawns, $45');
  for (let d = -9; d <= -1; d += 2) ad('side', d, 4, 15, 'A real payphone!');

  return { users, listings, orders, ads };
}

module.exports = { seed, FEE, mondayOf, addWeeks };
