// South African towns with approximate coordinates, used to place listings that only give a town name.
// [name, province, lat, lon]
export const places = [
  ['Johannesburg', 'Gauteng', -26.2041, 28.0473],
  ['Sandton', 'Gauteng', -26.1076, 28.0567],
  ['Randburg', 'Gauteng', -26.0936, 28.0064],
  ['Roodepoort', 'Gauteng', -26.1625, 27.8725],
  ['Soweto', 'Gauteng', -26.2678, 27.8585],
  ['Midrand', 'Gauteng', -25.9992, 28.1263],
  ['Pretoria', 'Gauteng', -25.7479, 28.2293],
  ['Centurion', 'Gauteng', -25.8603, 28.1894],
  ['Tshwane', 'Gauteng', -25.7479, 28.2293],
  ['Kempton Park', 'Gauteng', -26.1004, 28.2307],
  ['Germiston', 'Gauteng', -26.2312, 28.1677],
  ['Boksburg', 'Gauteng', -26.2125, 28.2596],
  ['Benoni', 'Gauteng', -26.1885, 28.3208],
  ['Ekurhuleni', 'Gauteng', -26.1777, 28.362],
  ['Alberton', 'Gauteng', -26.2672, 28.1222],
  ['Springs', 'Gauteng', -26.256, 28.44],
  ['Vereeniging', 'Gauteng', -26.6731, 27.9261],
  ['Vanderbijlpark', 'Gauteng', -26.711, 27.8379],
  ['Krugersdorp', 'Gauteng', -26.0856, 27.7752],
  ['Fourways', 'Gauteng', -26.0117, 28.0108],
  ['Rosebank', 'Gauteng', -26.146, 28.041],
  ['Cape Town', 'Western Cape', -33.9249, 18.4241],
  ['Bellville', 'Western Cape', -33.9, 18.6333],
  ['Stellenbosch', 'Western Cape', -33.9321, 18.8602],
  ['Paarl', 'Western Cape', -33.7342, 18.9621],
  ['Somerset West', 'Western Cape', -34.0757, 18.8433],
  ['George', 'Western Cape', -33.963, 22.4617],
  ['Worcester', 'Western Cape', -33.6464, 19.4485],
  ['Mossel Bay', 'Western Cape', -34.1831, 22.146],
  ['Knysna', 'Western Cape', -34.0363, 23.0471],
  ['Durban', 'KwaZulu-Natal', -29.8587, 31.0218],
  ['Umhlanga', 'KwaZulu-Natal', -29.7275, 31.0844],
  ['Pinetown', 'KwaZulu-Natal', -29.8167, 30.85],
  ['Pietermaritzburg', 'KwaZulu-Natal', -29.6006, 30.3794],
  ['Richards Bay', 'KwaZulu-Natal', -28.783, 32.0377],
  ['Newcastle', 'KwaZulu-Natal', -27.7576, 29.9318],
  ['Ballito', 'KwaZulu-Natal', -29.539, 31.214],
  ['Port Shepstone', 'KwaZulu-Natal', -30.7414, 30.455],
  ['Ladysmith', 'KwaZulu-Natal', -28.5539, 29.7784],
  ['Gqeberha', 'Eastern Cape', -33.9608, 25.6022],
  ['Port Elizabeth', 'Eastern Cape', -33.9608, 25.6022],
  ['East London', 'Eastern Cape', -33.0153, 27.9116],
  ['Mthatha', 'Eastern Cape', -31.5889, 28.7844],
  ['Makhanda', 'Eastern Cape', -33.3042, 26.5328],
  ['Uitenhage', 'Eastern Cape', -33.7578, 25.3971],
  ['Bloemfontein', 'Free State', -29.0852, 26.1596],
  ['Welkom', 'Free State', -27.9774, 26.7351],
  ['Bethlehem', 'Free State', -28.2308, 28.3071],
  ['Sasolburg', 'Free State', -26.8136, 27.8169],
  ['Kroonstad', 'Free State', -27.6504, 27.2349],
  ['Polokwane', 'Limpopo', -23.9045, 29.4689],
  ['Tzaneen', 'Limpopo', -23.8332, 30.1635],
  ['Thohoyandou', 'Limpopo', -22.9456, 30.485],
  ['Mokopane', 'Limpopo', -24.1944, 29.0097],
  ['Lephalale', 'Limpopo', -23.6719, 27.7426],
  ['Mbombela', 'Mpumalanga', -25.4753, 30.9694],
  ['Nelspruit', 'Mpumalanga', -25.4753, 30.9694],
  ['Witbank', 'Mpumalanga', -25.8713, 29.2332],
  ['eMalahleni', 'Mpumalanga', -25.8713, 29.2332],
  ['Middelburg', 'Mpumalanga', -25.7751, 29.4648],
  ['Secunda', 'Mpumalanga', -26.5167, 29.2],
  ['Rustenburg', 'North West', -25.6676, 27.2421],
  ['Mahikeng', 'North West', -25.8653, 25.6442],
  ['Potchefstroom', 'North West', -26.7145, 27.097],
  ['Klerksdorp', 'North West', -26.8521, 26.6667],
  ['Brits', 'North West', -25.6347, 27.7802],
  ['Kimberley', 'Northern Cape', -28.7282, 24.7499],
  ['Upington', 'Northern Cape', -28.4478, 21.2561],
  ['Springbok', 'Northern Cape', -29.6643, 17.8865],
  ['Kathu', 'Northern Cape', -27.6957, 23.049],
  // More towns and suburbs that employers list (added Oct 2026).
  ['Durbanville', 'Western Cape', -33.8326, 18.6474],
  ['Parow', 'Western Cape', -33.9, 18.5833],
  ['Brackenfell', 'Western Cape', -33.8792, 18.695],
  ['Kuils River', 'Western Cape', -33.9289, 18.6814],
  ['Milnerton', 'Western Cape', -33.877, 18.495],
  ['Table View', 'Western Cape', -33.822, 18.489],
  ['Claremont', 'Western Cape', -33.981, 18.465],
  ['Wynberg', 'Western Cape', -34.003, 18.468],
  ['Mitchells Plain', 'Western Cape', -34.044, 18.617],
  ['Khayelitsha', 'Western Cape', -34.04, 18.677],
  ['Strand', 'Western Cape', -34.11, 18.827],
  ['Hermanus', 'Western Cape', -34.4187, 19.2345],
  ['Oudtshoorn', 'Western Cape', -33.59, 22.201],
  ['Plettenberg Bay', 'Western Cape', -34.0527, 23.3716],
  ['Vredenburg', 'Western Cape', -32.906, 17.99],
  ['Saldanha', 'Western Cape', -33.011, 17.944],
  ['Malmesbury', 'Western Cape', -33.461, 18.727],
  ['Wellington', 'Western Cape', -33.639, 19.011],
  ['Franschhoek', 'Western Cape', -33.913, 19.121],
  ['Century City', 'Western Cape', -33.892, 18.511],
  ['Tygervalley', 'Western Cape', -33.874, 18.633],
  ['Edenvale', 'Gauteng', -26.141, 28.152],
  ['Bedfordview', 'Gauteng', -26.179, 28.136],
  ['Northcliff', 'Gauteng', -26.145, 27.969],
  ['Braamfontein', 'Gauteng', -26.193, 28.035],
  ['Hatfield', 'Gauteng', -25.748, 28.237],
  ['Menlyn', 'Gauteng', -25.783, 28.277],
  ['Akasia', 'Gauteng', -25.675, 28.11],
  ['Soshanguve', 'Gauteng', -25.52, 28.1],
  ['Mamelodi', 'Gauteng', -25.71, 28.36],
  ['Tembisa', 'Gauteng', -25.996, 28.227],
  ['Randfontein', 'Gauteng', -26.184, 27.702],
  ['Carletonville', 'Gauteng', -26.36, 27.397],
  ['Heidelberg', 'Gauteng', -26.504, 28.359],
  ['Nigel', 'Gauteng', -26.431, 28.477],
  ['Bryanston', 'Gauteng', -26.052, 28.023],
  ['Sunninghill', 'Gauteng', -26.033, 28.061],
  ['Woodmead', 'Gauteng', -26.048, 28.092],
  ['Lonehill', 'Gauteng', -26.011, 28.026],
  ['Honeydew', 'Gauteng', -26.067, 27.923],
  ['Lenasia', 'Gauteng', -26.315, 27.835],
  ['Diepsloot', 'Gauteng', -25.933, 28.012],
  ['Isando', 'Gauteng', -26.144, 28.205],
  ['Waterfall', 'Gauteng', -26.004, 28.096],
  ['Parktown', 'Gauteng', -26.18, 28.036],
  ['Westville', 'KwaZulu-Natal', -29.832, 30.93],
  ['Amanzimtoti', 'KwaZulu-Natal', -30.056, 30.88],
  ['Chatsworth', 'KwaZulu-Natal', -29.91, 30.88],
  ['Umlazi', 'KwaZulu-Natal', -29.97, 30.89],
  ['Phoenix', 'KwaZulu-Natal', -29.7, 31.0],
  ['Verulam', 'KwaZulu-Natal', -29.643, 31.048],
  ['Tongaat', 'KwaZulu-Natal', -29.57, 31.12],
  ['Scottburgh', 'KwaZulu-Natal', -30.286, 30.753],
  ['Howick', 'KwaZulu-Natal', -29.477, 30.229],
  ['Margate', 'KwaZulu-Natal', -30.863, 30.371],
  ['Kokstad', 'KwaZulu-Natal', -30.547, 29.427],
  ['Estcourt', 'KwaZulu-Natal', -29.009, 29.874],
  ['Vryheid', 'KwaZulu-Natal', -27.769, 30.792],
  ['Empangeni', 'KwaZulu-Natal', -28.762, 31.893],
  ['Hillcrest', 'KwaZulu-Natal', -29.781, 30.762],
  ['Kloof', 'KwaZulu-Natal', -29.79, 30.83],
  ['Komani', 'Eastern Cape', -31.898, 26.875],
  ['Queenstown', 'Eastern Cape', -31.898, 26.875],
  ['Jeffreys Bay', 'Eastern Cape', -34.033, 24.92],
  ['Graaff-Reinet', 'Eastern Cape', -32.252, 24.531],
  ['Qonce', 'Eastern Cape', -32.883, 27.4],
  ['King William', 'Eastern Cape', -32.883, 27.4],
  ['Parys', 'Free State', -26.901, 27.456],
  ['Harrismith', 'Free State', -28.275, 29.129],
  ['Phuthaditjhaba', 'Free State', -28.524, 28.816],
  ['Makhado', 'Limpopo', -23.043, 29.903],
  ['Louis Trichardt', 'Limpopo', -23.043, 29.903],
  ['Bela-Bela', 'Limpopo', -24.885, 28.293],
  ['Phalaborwa', 'Limpopo', -23.943, 31.141],
  ['Modimolle', 'Limpopo', -24.7, 28.4],
  ['Ermelo', 'Mpumalanga', -26.533, 29.983],
  ['Standerton', 'Mpumalanga', -26.95, 29.24],
  ['White River', 'Mpumalanga', -25.33, 31.01],
  ['Hazyview', 'Mpumalanga', -25.044, 31.127],
  ['Barberton', 'Mpumalanga', -25.786, 31.053],
  ['Lydenburg', 'Mpumalanga', -25.095, 30.45],
  ['Vryburg', 'North West', -26.957, 24.728],
  ['Zeerust', 'North West', -25.537, 26.075],
  ['Hartbeespoort', 'North West', -25.747, 27.851],
  ['De Aar', 'Northern Cape', -30.65, 24.012],
  ['Kuruman', 'Northern Cape', -27.452, 23.432],
];

/** A central point per province, for jobs with only a province. */
export const provinceCentres = {
  Gauteng: [-26.2041, 28.0473],
  'Western Cape': [-33.9249, 18.4241],
  'KwaZulu-Natal': [-29.8587, 31.0218],
  'Eastern Cape': [-32.2968, 26.4194],
  'Free State': [-28.4541, 26.7968],
  Limpopo: [-23.4013, 29.4179],
  Mpumalanga: [-25.5653, 30.5279],
  'North West': [-26.6639, 25.2838],
  'Northern Cape': [-29.0467, 21.8569],
};

// Find coordinates for a location string like "Sandton, Gauteng" or "Durban North".
const reCache = new Map();
/** Whole-word matcher for a town name (so "Durbanville" isn't "Durban"). */
const placeRe = name => {
  let re = reCache.get(name);
  if (!re) {
    re = new RegExp(`(^|[^a-z])${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z])`);
    reCache.set(name, re);
  }
  return re;
};

/** The town and province for a location text. */
export function placeFor(text) {
  const t = String(text || '').toLowerCase();
  if (!t) return null;
  // The first place named is usually the most specific ("Sandton, Johannesburg" → Sandton).
  let best = null;
  for (const [name, province, lat, lon] of places) {
    const m = t.match(placeRe(name)); // whole words only: "Durban" must not match "Durbanville"
    if (!m) continue;
    const at = m.index + m[1].length;
    if (!best || at < best.at || (at === best.at && name.length > best.name.length))
      best = {name, province, lat, lon, at};
  }
  if (best) return best;
  for (const [province, [lat, lon]] of Object.entries(provinceCentres)) {
    if (t.includes(province.toLowerCase())) return {name: province, province, lat, lon, approx: true};
  }
  return null;
}
