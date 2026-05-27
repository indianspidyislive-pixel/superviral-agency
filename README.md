# Superviral — Agency Site

Static one-page website for **superviral.agency**. No build step, no framework. Just `index.html` + `styles.css` + `script.js`.

## Files

```
agency-site/
├── index.html   # all the page content
├── styles.css   # design / theme
├── script.js    # form handling + smooth scroll
└── README.md
```

## Customize before launch

Open `index.html` and update:

- Hero stats (`$8M+`, `40+`, `Top 0.4%`) — these are placeholders. Either rewrite to honest numbers or replace with copy like "New roster opening 2026."
- Testimonials in the **Results** section — replace with real client names and stats once you have them.
- `https://t.me/yourhandle` in the footer — your real Telegram link, or remove that line.
- Optional: niche the copy down to gay/male creators if that's your focus market (the FAQ already mentions it; you can also update the hero subhead).

For colors / fonts, edit the `:root` variables at the top of `styles.css`.

## Wiring up the application form

Two modes:

1. **Email fallback (default)** — submitting opens the user's mail app to `hello@superviral.agency` with their answers prefilled. Works without setup, but requires you to have email at that domain.
2. **Hosted form (recommended)** — applications land in a real inbox, no client mail app needed.
   1. Sign up free at https://formspree.io
   2. Create a new form, copy the endpoint URL (looks like `https://formspree.io/f/abcd1234`)
   3. Paste it into `script.js` as `FORM_ENDPOINT`

Alternative free options: [Web3Forms](https://web3forms.com), [Getform](https://getform.io), [Basin](https://usebasin.com).

## Hosting (free + custom domain)

### Recommended: Cloudflare Pages

Best long-term home — free, fast, integrates cleanly with the domain registrar.

1. Buy `superviral.agency` at **Cloudflare Registrar** (https://dash.cloudflare.com → Domain Registration → Register Domains). At-cost pricing.
2. Make a free GitHub account if you don't have one. Create a new repo and upload these files.
3. Go to https://pages.cloudflare.com → **Create project** → connect GitHub → pick the repo.
4. Build settings: leave everything blank, hit deploy.
5. After it's live, **Custom domains** → add `superviral.agency`. Cloudflare wires DNS automatically since the domain is in their registrar.

### Quickest: Netlify drop

If you want it live in the next 60 seconds:

1. Buy the domain anywhere (Namecheap, Porkbun, Cloudflare).
2. Go to https://app.netlify.com/drop
3. Drag the `agency-site` folder into the drop zone — instantly live at a `*.netlify.app` URL.
4. **Site settings → Domain management → Add custom domain → `superviral.agency`** — follow DNS instructions.

### Vercel works too

Same idea: import GitHub repo or drag a folder, then add the custom domain.

## Email at your domain

To receive applications at `hello@superviral.agency`:

- **Free option**: [Cloudflare Email Routing](https://www.cloudflare.com/products/email-routing/) — forwards `hello@superviral.agency` to your Gmail. Setup in 5 min.
- **Paid pro option**: Google Workspace ($6/mo) — full inbox, calendar, drive at your domain. Use this once you have clients.

## SEO basics already in place

- Title + meta description
- Open Graph tags (Twitter/X previews work)
- Canonical URL set to `https://superviral.agency/`
- Semantic HTML, mobile responsive, fast (no JS framework)

To do once live:
- Create a 1200×630 OG preview image, save as `/og.png`, add `<meta property="og:image" content="https://superviral.agency/og.png" />` to the head
- Add a favicon
- Submit the site to Google Search Console
