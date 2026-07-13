# Tender247 Filter

Web app to filter [Tender247](https://www.tender247.com) Software-profile tenders by closing date.

## Rules applied

- **Exclude:** corrigendum, installation, toners, laptops, solar, SCADA, civil, etc.
- **API finance:** remove if value > ₹1 Cr or EMD > ₹2 Lakh (when API shows a number)
- **Optional:** read NIT/PDF for notes only (does not filter)

## Local run

```bash
npm install
set T247_EMAIL=your@email.com
set T247_PASSWORD=your_password
npm start
```

Open http://localhost:3847

## Deploy (Render — free browser access)

1. Push this repo to GitHub (see below).
2. Go to [render.com](https://render.com) → **New** → **Blueprint** (or **Web Service**).
3. Connect your GitHub repo.
4. Set environment variables:
   - `T247_EMAIL` — your Tender247 login email
   - `T247_PASSWORD` — your Tender247 password
5. Deploy. Render uses `render.yaml` automatically.

**Start command:** `npm start`  
**Port:** Render sets `PORT` automatically.

> **Note:** The live URL is public. Anyone who finds it can trigger scans using your Tender247 account. Do not share the URL widely, or add auth later.

## Push to GitHub

```bash
git init
git add .
git commit -m "Tender247 filter web app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/tender247-filter.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username. Create an empty repo on GitHub first (no README).
