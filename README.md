# AB Wellness Consulting

Production-ready Next.js 16 app for AB Wellness Consulting. The current public view is a coming-soon waitlist with a launch countdown and MongoDB email capture.

## Stack

- Next.js 16 (App Router, TypeScript)
- Once UI + Tailwind CSS
- MongoDB via Mongoose
- Resend for waitlist emails
- Lucide / Once UI icons

## Setup

```bash
npm install
cp .env.example .env.local
```

Add a MongoDB Atlas or local connection string to `.env.local`:

```bash
MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/abwellness?retryWrites=true&w=majority
NEXT_PUBLIC_SITE_URL=http://localhost:3000
RESEND_API_KEY=re_xxxxxxxxx
RESEND_FROM_EMAIL=AB Wellness Consulting <onboarding@resend.dev>
WAITLIST_NOTIFY_EMAIL=hello@abwellnessconsulting.com
```

Then start the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Waitlist signups are saved to MongoDB through `POST /api/subscribe`. Resend then sends a confirmation to the subscriber and a notice to `WAITLIST_NOTIFY_EMAIL`. Get an API key from [resend.com/api-keys](https://resend.com/api-keys). Until a domain is verified at [resend.com/domains](https://resend.com/domains), use `onboarding@resend.dev` as the from address.

## Project structure

```text
app/                 App Router pages and API routes
components/ui/       Coming soon, countdown, form, and footer
lib/                 MongoDB client, constants, validation
models/              Mongoose schemas
types/               Shared TypeScript types
resources/           Once UI theme, icons, and SEO config
public/images/       Brand assets, including logo_ab.png
```
