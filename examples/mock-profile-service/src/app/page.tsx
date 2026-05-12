import styles from "./page.module.css";
import { profiles } from "@/data/profiles";

export default function Home() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>CDP Profile Mock API</h1>
        <p>
          10 mock visitor profiles with audience, geo, reservation, and
          membership data.
        </p>
      </header>

      <div className={styles.endpoints}>
        <a href="/api/profiles" className={styles.endpoint}>
          GET /api/profiles
        </a>
        <a href="/api/profiles/1" className={styles.endpoint}>
          GET /api/profiles/:id
        </a>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Audience</th>
              <th>Zip</th>
              <th>Geo</th>
              <th>Reservation</th>
              <th>Membership</th>
              <th>API</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td>{p.name}</td>
                <td>{p.audience}</td>
                <td>{p.zipCode}</td>
                <td>
                  <span
                    className={`${styles.badge} ${p.geoProximity === "local" ? styles.local : styles.outOfTowner}`}
                  >
                    {p.geoProximity}
                  </span>
                </td>
                <td>
                  {p.reservation ? (
                    <>
                      {p.reservation.hotelName}
                      <br />
                      {p.reservation.checkIn} &rarr; {p.reservation.checkOut}
                    </>
                  ) : (
                    <span className={styles.noReservation}>none</span>
                  )}
                </td>
                <td>
                  <span
                    className={`${styles.badge} ${p.membershipStatus === "member" ? styles.member : styles.nonMember}`}
                  >
                    {p.membershipStatus}
                  </span>
                </td>
                <td>
                  <a
                    href={`/api/profiles/${p.id}`}
                    className={styles.link}
                  >
                    /api/profiles/{p.id}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
