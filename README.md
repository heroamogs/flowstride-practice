# Flowstride Practice

A standalone local car rental app for practicing browser and API testing with Flowstride (FS).

The app listens on loopback. Its cars, users, bookings and payment outcomes are fictional. It stores activity in memory and restores the seed data every time you restart it. The default start loads a few sample users and bookings so the dashboards are ready to explore.

## Start the app

Use Node.js **22.12 or newer** and npm.

```sh
git clone https://github.com/heroamogs/flowstride-practice.git
cd flowstride-practice
npm start
```

Open [http://127.0.0.1:4355](http://127.0.0.1:4355). If that port is taken, start with `npm start -- 4356` and use the address printed in the terminal. Use `npm start -- --empty` to begin with just the driver and admin accounts and an empty booking history.

| Account | Email | Practice password |
| --- | --- | --- |
| Practice Driver | `driver@example.test` | `practice-driver` |
| Practice Admin | `admin@example.test` | `practice-admin` |
| Booking approver (sample data) | `approver@example.test` | `practice-approver` |

Pick a car, sign in as the driver, choose pickup and return dates, and place a booking. The simulated checkout can succeed or decline. A successful booking appears in **My bookings** as **Awaiting approval**. Sign in as the admin or a Booking approver to approve it in **Review bookings**. The driver can cancel a booking before or on its pickup date to release the dates. After approval, the driver can open the receipt in a new tab and download the JSON file. The admin dashboard shows the booking queue, recent decisions, and team access. The approver has the booking queue and approval actions.

## Practice with six tables

Open **Tables** in the main navigation or visit [the local tables page](http://127.0.0.1:4355/tables). Anyone using the local app can open it without signing in.

| Table | Try it |
| --- | --- |
| Renter directory | Find Tarela Briggs by email, sort by full name, and edit her membership. |
| Fleet register | Filter by **Service hold**. Edit the Nissan's odometer to 16,040 km with **Recently updated** selected and watch its row move to the top. |
| Rental invoice | Inspect the three charge rows and the separate ₦97,500 footer total. |
| Service clearance queue | Release CL-851. The Peugeot becomes **Ready** in the fleet register. Release CL-867 to empty the queue. |
| Branch pickup slots | Read across the Uyo row: four slots at 10:00 and zero at 12:00. |
| Reservation payments | Open both reservations to compare their nested payment tables. PAY-927 is the ₦15,000 card payment for BK-6308. |

**Load email error** changes Morayo's email to `morayo.dada.example.test` so students can practice diagnosing a failed check. **Reset practice data** restores the six tables, their default ordering, and the collapsed payment rows. Table edits are shared across tabs on the same running instance and reset on restart. The reset button affects only these teaching records. Keep student test scripts in the separate project described below.

## Sign up and book as a new Member

Select **Sign up** and enter a fictional email ending in `.test`, such as `new-driver@example.test`, and a practice password. Open the **practice inbox** from the verification page and copy the six-digit code. The code expires after 10 minutes. The inbox belongs to the browser that started the sign-up and runs entirely on localhost.

After verification, sign in with the same email and password. Self-service accounts start as **Member** and can book cars immediately. The booking appears as **Awaiting approval**. The app clears new accounts and any bookings when it restarts.

## Connect your Flowstride test project

Keep the practice app running in its terminal. Open a second terminal in your separate Flowstride project. Set `baseUrl` in that project's `flowstride.config.json` to `http://127.0.0.1:4355` or the address printed by the app. Run `npx flowstride run` from the test project.

## Test the app

Run `npm test` in the app repository to check its HTTP routes and reset behavior.

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
