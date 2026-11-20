# Flowstride Practice

A local car rental app and runnable Flowstride (FS) 2.0 lessons. Use the same app to teach browser tests, API tests, JavaScript and TypeScript helpers, and dependent flows.

The app listens on loopback. Its cars, users, bookings and payment outcomes are fictional. It stores activity in memory and restores the seed data every time you restart it.

## Start the app

Use Node.js **22.12 or newer** and npm.

```sh
git clone https://github.com/heroamogs/flowstride-practice.git
cd flowstride-practice
npm ci
npm start
```

Open [http://127.0.0.1:4355](http://127.0.0.1:4355). If that port is taken, start with `npm start -- 4356` and point your FS project’s `BASE_URL` at the printed address. The included project defaults to port 4355.

| Account | Email | Practice password |
| --- | --- | --- |
| Practice Driver | `driver@example.test` | `practice-driver` |
| Practice Admin | `admin@example.test` | `practice-admin` |

Pick a car, sign in as the driver, choose pickup and return dates, and place a booking. The simulated checkout can succeed or decline. A successful booking appears in **My bookings** as **Awaiting approval**. Sign in as the admin or a Booking approver to approve it in **Review bookings**. The driver can cancel it to release the dates.

## Run a lesson in the dashboard

With the app running, open a second terminal in the repository and run:

```sh
npx flowstride install chromium
npm run lesson -- flows/starter/browse-catalog.flow
```

Choose the local dashboard link printed by FS. The browser runs headlessly and the dashboard is interactive. Append `--headed` to also open the test browser. If you changed the app’s port, set `BASE_URL` in that terminal before starting FS.

| Lesson | File | What it verifies |
| --- | --- | --- |
| Filter the catalog | [browse-catalog.flow](flows/starter/browse-catalog.flow) | The Hatchback filter returns 10 cars and Kite 001 shows a discounted catalog price. |
| Sign in | [login.flow](flows/starter/login.flow) | The browser opens the seeded driver’s account. |
| Use a JavaScript helper | [catalog-api.flow](flows/starter/catalog-api.flow) | A helper receives the extracted API array and checks count and sort order. |
| Compare API prices with the browser | [check-catalog-prices.flow](flows/advanced/check-catalog-prices.flow) | TypeScript helpers match 50 cards by SKU and check four delivery quotes. |
| Recover a checkout | [checkout.flow](flows/booking/checkout.flow) | A payment decline keeps the dates available, then a successful checkout creates a booking. |
| Combine API and browser | [api-to-browser.flow](flows/booking/api-to-browser.flow) | A driver books through the API, an admin approves the same booking in the browser, and the driver sees the updated status. |
| Create and approve a user through the API | [approve-user-and-sign-in.flow](flows/api-and-ui/approve-user-and-sign-in.flow) | A user created by the API can sign in to the browser with the assigned permission. |
| Hand off a user between flows | [new-user-signs-in.flow](flows/advanced/new-user-signs-in.flow) | The admin creates the user in the UI, retries the first rejected role save, and hands the successful account to the waiting sign-in flow. FS includes the [admin flow](flows/advanced/admin-creates-user.flow) automatically. |

For the credential handoff lesson, use `--headed` to see the actual browser forms. Flowstride applies its standard evidence restrictions when a handoff carries credentials.

The booking lessons create a disposable driver and clean up its reservations when each attempt finishes. If a forcibly stopped run leaves data behind, restart the app to reset the workspace. In the handoff lesson, set `retries` to `0` in your own local configuration to demonstrate the dependent flow becoming **Blocked** after the admin fails, then restore `retries` to `1`.

## Run a clean suite locally or in CI

```sh
npm test
npx flowstride install chromium
npm run test:flows
```

`npm test` exercises the HTTP routes and reset behavior. `npm run test:flows` creates a fresh loopback instance on a free port, runs the lessons headlessly, writes FS results to `flowstride-artifacts/`, and shuts the app down. Pass a path after `--` to run an individual lesson with the same isolated setup.

## API routes for your own flows

| Request | Purpose |
| --- | --- |
| `GET /health` | Check that the instance is ready. |
| `GET /api/cars` | List the catalog. Supports `q`, `category`, and `sort=price-asc` or `price-desc`. |
| `GET /api/cars/CAR-001/quote?delivery=local` | Check a catalog price and delivery total. Catalog prices are separate from daily rental rates. |
| `POST /api/session` | Sign in with `email` and `password` and receive a local session cookie. |
| `GET /api/account` | Read the signed-in account and role. |
| `POST /api/bookings` | Book with `sku`, `pickupDate`, `returnDate`, and `payment` set to `success` or `declined`. |
| `GET /api/bookings` or `GET /api/bookings/:id` | Read the current user’s bookings. |
| `GET /api/bookings/review` | Read bookings as an administrator or Booking approver. |
| `POST /api/bookings/:id/approve` | Approve a pending booking as an administrator or Booking approver. |
| `POST /api/bookings/:id/cancel` | Cancel a booking as its owner. |
| `GET /api/admin/users` or `POST /api/admin/users` | List or create users as the administrator. |
| `PATCH /api/admin/users/:id/role` | Assign a member role as the administrator. |
| `DELETE /api/admin/users/:id` | Remove a temporary user and their bookings as the administrator. |

Rental date ranges use ISO dates. The return date is exclusive, so June 12 to June 15 is a three-day rental. Returns must be one to 30 days after pickup. The server calculates totals in cents and rejects overlapping active bookings for the same car.

Built from the [FS 2.0 bundled practice app](https://github.com/heroamogs/flowstride/tree/prod/examples/practice-app). See the [Flowstride docs](https://docs.flowstride.io/) for language and dashboard guides.
