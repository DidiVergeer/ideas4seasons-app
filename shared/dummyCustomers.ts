export type CustomerAddress = {
  id: string;
  label?: string; // bv "Bezoekadres", "Leveradres"
  street?: string;
  houseNumber?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  // later: lat/lng voor map
  lat?: number;
  lng?: number;
};

export type CustomerContactPerson = {
  id: string;
  name: string;
  role?: string;
  phone?: string;
  email?: string;
};

export type CustomerFinancial = {
  accountManager?: string; // verkoopagent
  priceList?: string;
  paymentTerms?: string; // bv "30 days"
};

export type Customer = {
  id: string;
  customerNumber: string;
  name: string;

  phone?: string;
  email?: string;

  // hoofdadres
  address?: CustomerAddress;

  // extra data
  contactPersons?: CustomerContactPerson[];
  financial?: CustomerFinancial;
  addresses?: CustomerAddress[]; // meerdere adressen
};

const CUSTOMERS: Customer[] = [
  {
    id: "c1",
    customerNumber: "1000123",
    name: "Van Dijk Retail B.V.",
    phone: "010-1234567",
    email: "inkoop@vandijkretail.nl",
    address: {
      id: "a1",
      label: "Bezoekadres",
      street: "Havenstraat",
      houseNumber: "12",
      postalCode: "3011AA",
      city: "Rotterdam",
      country: "NL",
      lat: 51.9225,
      lng: 4.47917,
    },
    contactPersons: [
      { id: "p1", name: "Olivier Goyer", role: "Inkoop", email: "olivier@vandijkretail.nl", phone: "010-7654321" },
      { id: "p2", name: "Sanne Jansen", role: "Administratie", email: "admin@vandijkretail.nl" },
    ],
    financial: {
      accountManager: "Agent A100",
      priceList: "NL Retail 2025",
      paymentTerms: "30 dagen",
    },
    addresses: [
      {
        id: "a1",
        label: "Bezoekadres",
        street: "Havenstraat",
        houseNumber: "12",
        postalCode: "3011AA",
        city: "Rotterdam",
        country: "NL",
      },
      {
        id: "a2",
        label: "Leveradres",
        street: "Kadeweg",
        houseNumber: "3",
        postalCode: "3011AB",
        city: "Rotterdam",
        country: "NL",
      },
    ],
  },
  {
    id: "c2",
    customerNumber: "1000456",
    name: "Bloemenhuis De Linde",
    phone: "020-1112233",
    email: "info@delinde.nl",
    address: {
      id: "a1",
      label: "Bezoekadres",
      street: "Dorpsstraat",
      houseNumber: "88",
      postalCode: "1182AB",
      city: "Amstelveen",
      country: "NL",
      lat: 52.303,
      lng: 4.859,
    },
    contactPersons: [{ id: "p1", name: "M. de Linde", role: "Eigenaar", phone: "020-1112233" }],
    financial: {
      accountManager: "Agent A100",
      priceList: "NL B2B 2025",
      paymentTerms: "14 dagen",
    },
    addresses: [
      {
        id: "a1",
        label: "Bezoekadres",
        street: "Dorpsstraat",
        houseNumber: "88",
        postalCode: "1182AB",
        city: "Amstelveen",
        country: "NL",
      },
    ],
  },
];

export function getCustomersForUser(_userId: string) {
  // later: filter op user
  return CUSTOMERS;
}

export function getCustomerById(id: string) {
  return CUSTOMERS.find((c) => c.id === id) ?? null;
}
