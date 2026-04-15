# Mock Profile Service

A Next.js app that serves as a **mock CDP (Customer Data Platform)** for the Context as a Service demo. It provides visitor profile data that the context service wrappers use to build personalization quirks.

In production, this would be replaced by a real CDP, CRM, loyalty system, or identity service.

## API

### `GET /api/profiles/:id`

Returns the profile for a given visitor ID.

**Response shape:**

```json
{
  "id": "1",
  "name": "Marcus Chen",
  "audience": "loyalists",
  "zipCode": "13478",
  "geoProximity": "local",
  "reservation": {
    "confirmationNumber": "TS-20260315-8841",
    "hotelName": "The Lodge",
    "checkIn": "2026-03-15",
    "checkOut": "2026-03-18"
  },
  "membershipStatus": "member"
}
```

## Profile data

The service includes 10 test visitors covering all audience segments and reservation states:

| ID | Name | Audience | Geo | Reservation | Membership |
|----|------|----------|-----|-------------|------------|
| 1 | Marcus Chen | loyalists | local | Yes | member |
| 2 | Priya Patel | golf | local | Yes | member |
| 3 | Sofia Rodriguez | leisure | out-of-towner | Yes | non-member |
| 4 | James O'Brien | corporate | local | No | member |
| 5 | Aisha Johnson | wellness | out-of-towner | Yes | non-member |
| 6 | Volodymyr Chervoniy | golf | local | Yes | member |
| 7 | Hannah Kim | corporate | out-of-towner | Yes | non-member |
| 8 | Luca Moretti | loyalists | local | Yes | member |
| 9 | Tanya Brooks | leisure | local | No | non-member |
| 10 | Erik Johansson | wellness | out-of-towner | Yes | member |

## How the context service uses profiles

The context service maps profile fields to **quirks** for Uniform personalization:

| Profile field | Quirk key | Example value |
|---------------|-----------|---------------|
| `audience` | `audience` | `"loyalists"`, `"golf"`, `"leisure"`, `"corporate"`, `"wellness"` |
| `geoProximity` | `geoAudience` | `"local"`, `"out-of-towner"` |
| `reservation` | `hasReservation` | `"true"` / `"false"` (based on confirmation number presence) |

## Setup

```bash
npm install
npm run dev
```

Runs at `http://localhost:3000` by default. Configure the context service wrappers to point to this URL via the `PROFILE_SERVICE_URL` environment variable.

## Deployment

Deployed at `https://cdpmock.vercel.app` for the demo. All context service wrappers default to this URL when `PROFILE_SERVICE_URL` is not set.
