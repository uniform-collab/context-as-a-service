export interface Reservation {
  confirmationNumber: string;
  hotelName: string;
  checkIn: string;
  checkOut: string;
}

export interface Profile {
  id: string;
  name: string;
  audience: "loyalists" | "golf" | "leisure" | "corporate" | "wellness";
  zipCode: string;
  geoProximity: "local" | "out-of-towner";
  reservation: Reservation | null;
  membershipStatus: "member" | "non-member";
}

export const profiles: Profile[] = [
  {
    id: "1",
    name: "Marcus Chen",
    audience: "loyalists",
    zipCode: "13478",
    geoProximity: "local",
    reservation: {
      confirmationNumber: "TS-20260315-8841",
      hotelName: "The Lodge",
      checkIn: "2026-03-15",
      checkOut: "2026-03-18",
    },
    membershipStatus: "member",
  },
  {
    id: "2",
    name: "Priya Patel",
    audience: "golf",
    zipCode: "13440",
    geoProximity: "local",
    reservation: {
      confirmationNumber: "TS-20260401-2294",
      hotelName: "The Tower",
      checkIn: "2026-04-01",
      checkOut: "2026-04-04",
    },
    membershipStatus: "member",
  },
  {
    id: "3",
    name: "Sofia Rodriguez",
    audience: "leisure",
    zipCode: "10001",
    geoProximity: "out-of-towner",
    reservation: {
      confirmationNumber: "TS-20260320-5537",
      hotelName: "The Lodge",
      checkIn: "2026-03-20",
      checkOut: "2026-03-23",
    },
    membershipStatus: "non-member",
  },
  {
    id: "4",
    name: "James O'Brien",
    audience: "corporate",
    zipCode: "13502",
    geoProximity: "local",
    reservation: null,
    membershipStatus: "member",
  },
  {
    id: "5",
    name: "Aisha Johnson",
    audience: "wellness",
    zipCode: "02101",
    geoProximity: "out-of-towner",
    reservation: {
      confirmationNumber: "TS-20260510-7712",
      hotelName: "The Tower",
      checkIn: "2026-05-10",
      checkOut: "2026-05-14",
    },
    membershipStatus: "non-member",
  },
  {
    id: "6",
    name: "Volodymyr Chervoniy",
    audience: "golf",
    zipCode: "13413",
    geoProximity: "local",
    reservation: {
      confirmationNumber: "TS-20260328-3309",
      hotelName: "The Lodge",
      checkIn: "2026-03-28",
      checkOut: "2026-03-30",
    },
    membershipStatus: "member",
  },
  {
    id: "7",
    name: "Hannah Kim",
    audience: "corporate",
    zipCode: "60601",
    geoProximity: "out-of-towner",
    reservation: {
      confirmationNumber: "TS-20260415-6601",
      hotelName: "The Tower",
      checkIn: "2026-04-15",
      checkOut: "2026-04-17",
    },
    membershipStatus: "non-member",
  },
  {
    id: "8",
    name: "Luca Moretti",
    audience: "loyalists",
    zipCode: "13476",
    geoProximity: "local",
    reservation: {
      confirmationNumber: "TS-20260601-4450",
      hotelName: "The Lodge",
      checkIn: "2026-06-01",
      checkOut: "2026-06-05",
    },
    membershipStatus: "member",
  },
  {
    id: "9",
    name: "Tanya Brooks",
    audience: "leisure",
    zipCode: "13421",
    geoProximity: "local",
    reservation: null,
    membershipStatus: "non-member",
  },
  {
    id: "10",
    name: "Erik Johansson",
    audience: "wellness",
    zipCode: "19103",
    geoProximity: "out-of-towner",
    reservation: {
      confirmationNumber: "TS-20260720-1187",
      hotelName: "The Tower",
      checkIn: "2026-07-20",
      checkOut: "2026-07-24",
    },
    membershipStatus: "member",
  },
];
