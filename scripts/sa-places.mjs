// South African towns with approximate coordinates, used to place listings that only give a town name.
// [name, province, lat, lon]
export const places = [
  ['Johannesburg', 'Gauteng', -26.2041, 28.0473], ['Sandton', 'Gauteng', -26.1076, 28.0567], ['Randburg', 'Gauteng', -26.0936, 28.0064],
  ['Roodepoort', 'Gauteng', -26.1625, 27.8725], ['Soweto', 'Gauteng', -26.2678, 27.8585], ['Midrand', 'Gauteng', -25.9992, 28.1263],
  ['Pretoria', 'Gauteng', -25.7479, 28.2293], ['Centurion', 'Gauteng', -25.8603, 28.1894], ['Tshwane', 'Gauteng', -25.7479, 28.2293],
  ['Kempton Park', 'Gauteng', -26.1004, 28.2307], ['Germiston', 'Gauteng', -26.2312, 28.1677], ['Boksburg', 'Gauteng', -26.2125, 28.2596],
  ['Benoni', 'Gauteng', -26.1885, 28.3208], ['Ekurhuleni', 'Gauteng', -26.1777, 28.3620], ['Alberton', 'Gauteng', -26.2672, 28.1222],
  ['Springs', 'Gauteng', -26.2560, 28.4400], ['Vereeniging', 'Gauteng', -26.6731, 27.9261], ['Vanderbijlpark', 'Gauteng', -26.7110, 27.8379],
  ['Krugersdorp', 'Gauteng', -26.0856, 27.7752], ['Fourways', 'Gauteng', -26.0117, 28.0108], ['Rosebank', 'Gauteng', -26.1460, 28.0410],
  ['Cape Town', 'Western Cape', -33.9249, 18.4241], ['Bellville', 'Western Cape', -33.9000, 18.6333], ['Stellenbosch', 'Western Cape', -33.9321, 18.8602],
  ['Paarl', 'Western Cape', -33.7342, 18.9621], ['Somerset West', 'Western Cape', -34.0757, 18.8433], ['George', 'Western Cape', -33.9630, 22.4617],
  ['Worcester', 'Western Cape', -33.6464, 19.4485], ['Mossel Bay', 'Western Cape', -34.1831, 22.1460], ['Knysna', 'Western Cape', -34.0363, 23.0471],
  ['Durban', 'KwaZulu-Natal', -29.8587, 31.0218], ['Umhlanga', 'KwaZulu-Natal', -29.7275, 31.0844], ['Pinetown', 'KwaZulu-Natal', -29.8167, 30.8500],
  ['Pietermaritzburg', 'KwaZulu-Natal', -29.6006, 30.3794], ['Richards Bay', 'KwaZulu-Natal', -28.7830, 32.0377], ['Newcastle', 'KwaZulu-Natal', -27.7576, 29.9318],
  ['Ballito', 'KwaZulu-Natal', -29.5390, 31.2140], ['Port Shepstone', 'KwaZulu-Natal', -30.7414, 30.4550], ['Ladysmith', 'KwaZulu-Natal', -28.5539, 29.7784],
  ['Gqeberha', 'Eastern Cape', -33.9608, 25.6022], ['Port Elizabeth', 'Eastern Cape', -33.9608, 25.6022], ['East London', 'Eastern Cape', -33.0153, 27.9116],
  ['Mthatha', 'Eastern Cape', -31.5889, 28.7844], ['Makhanda', 'Eastern Cape', -33.3042, 26.5328], ['Uitenhage', 'Eastern Cape', -33.7578, 25.3971],
  ['Bloemfontein', 'Free State', -29.0852, 26.1596], ['Welkom', 'Free State', -27.9774, 26.7351], ['Bethlehem', 'Free State', -28.2308, 28.3071],
  ['Sasolburg', 'Free State', -26.8136, 27.8169], ['Kroonstad', 'Free State', -27.6504, 27.2349],
  ['Polokwane', 'Limpopo', -23.9045, 29.4689], ['Tzaneen', 'Limpopo', -23.8332, 30.1635], ['Thohoyandou', 'Limpopo', -22.9456, 30.4850],
  ['Mokopane', 'Limpopo', -24.1944, 29.0097], ['Lephalale', 'Limpopo', -23.6719, 27.7426],
  ['Mbombela', 'Mpumalanga', -25.4753, 30.9694], ['Nelspruit', 'Mpumalanga', -25.4753, 30.9694], ['Witbank', 'Mpumalanga', -25.8713, 29.2332],
  ['eMalahleni', 'Mpumalanga', -25.8713, 29.2332], ['Middelburg', 'Mpumalanga', -25.7751, 29.4648], ['Secunda', 'Mpumalanga', -26.5167, 29.2000],
  ['Rustenburg', 'North West', -25.6676, 27.2421], ['Mahikeng', 'North West', -25.8653, 25.6442], ['Potchefstroom', 'North West', -26.7145, 27.0970],
  ['Klerksdorp', 'North West', -26.8521, 26.6667], ['Brits', 'North West', -25.6347, 27.7802],
  ['Kimberley', 'Northern Cape', -28.7282, 24.7499], ['Upington', 'Northern Cape', -28.4478, 21.2561], ['Springbok', 'Northern Cape', -29.6643, 17.8865],
  ['Kathu', 'Northern Cape', -27.6957, 23.0490],
  // More towns and suburbs that employers list (added Oct 2026).
  ['Durbanville', 'Western Cape', -33.8326, 18.6474], ['Parow', 'Western Cape', -33.9000, 18.5833], ['Brackenfell', 'Western Cape', -33.8792, 18.6950],
  ['Kuils River', 'Western Cape', -33.9289, 18.6814], ['Milnerton', 'Western Cape', -33.8770, 18.4950], ['Table View', 'Western Cape', -33.8220, 18.4890],
  ['Claremont', 'Western Cape', -33.9810, 18.4650], ['Wynberg', 'Western Cape', -34.0030, 18.4680], ['Mitchells Plain', 'Western Cape', -34.0440, 18.6170],
  ['Khayelitsha', 'Western Cape', -34.0400, 18.6770], ['Strand', 'Western Cape', -34.1100, 18.8270], ['Hermanus', 'Western Cape', -34.4187, 19.2345],
  ['Oudtshoorn', 'Western Cape', -33.5900, 22.2010], ['Plettenberg Bay', 'Western Cape', -34.0527, 23.3716], ['Vredenburg', 'Western Cape', -32.9060, 17.9900],
  ['Saldanha', 'Western Cape', -33.0110, 17.9440], ['Malmesbury', 'Western Cape', -33.4610, 18.7270], ['Wellington', 'Western Cape', -33.6390, 19.0110],
  ['Franschhoek', 'Western Cape', -33.9130, 19.1210], ['Century City', 'Western Cape', -33.8920, 18.5110], ['Tygervalley', 'Western Cape', -33.8740, 18.6330],
  ['Edenvale', 'Gauteng', -26.1410, 28.1520], ['Bedfordview', 'Gauteng', -26.1790, 28.1360], ['Northcliff', 'Gauteng', -26.1450, 27.9690],
  ['Braamfontein', 'Gauteng', -26.1930, 28.0350], ['Hatfield', 'Gauteng', -25.7480, 28.2370], ['Menlyn', 'Gauteng', -25.7830, 28.2770],
  ['Akasia', 'Gauteng', -25.6750, 28.1100], ['Soshanguve', 'Gauteng', -25.5200, 28.1000], ['Mamelodi', 'Gauteng', -25.7100, 28.3600],
  ['Tembisa', 'Gauteng', -25.9960, 28.2270], ['Randfontein', 'Gauteng', -26.1840, 27.7020], ['Carletonville', 'Gauteng', -26.3600, 27.3970],
  ['Heidelberg', 'Gauteng', -26.5040, 28.3590], ['Nigel', 'Gauteng', -26.4310, 28.4770], ['Bryanston', 'Gauteng', -26.0520, 28.0230],
  ['Sunninghill', 'Gauteng', -26.0330, 28.0610], ['Woodmead', 'Gauteng', -26.0480, 28.0920], ['Lonehill', 'Gauteng', -26.0110, 28.0260],
  ['Honeydew', 'Gauteng', -26.0670, 27.9230], ['Lenasia', 'Gauteng', -26.3150, 27.8350], ['Diepsloot', 'Gauteng', -25.9330, 28.0120],
  ['Isando', 'Gauteng', -26.1440, 28.2050], ['Waterfall', 'Gauteng', -26.0040, 28.0960], ['Parktown', 'Gauteng', -26.1800, 28.0360],
  ['Westville', 'KwaZulu-Natal', -29.8320, 30.9300], ['Amanzimtoti', 'KwaZulu-Natal', -30.0560, 30.8800], ['Chatsworth', 'KwaZulu-Natal', -29.9100, 30.8800],
  ['Umlazi', 'KwaZulu-Natal', -29.9700, 30.8900], ['Phoenix', 'KwaZulu-Natal', -29.7000, 31.0000], ['Verulam', 'KwaZulu-Natal', -29.6430, 31.0480],
  ['Tongaat', 'KwaZulu-Natal', -29.5700, 31.1200], ['Scottburgh', 'KwaZulu-Natal', -30.2860, 30.7530], ['Howick', 'KwaZulu-Natal', -29.4770, 30.2290],
  ['Margate', 'KwaZulu-Natal', -30.8630, 30.3710], ['Kokstad', 'KwaZulu-Natal', -30.5470, 29.4270], ['Estcourt', 'KwaZulu-Natal', -29.0090, 29.8740],
  ['Vryheid', 'KwaZulu-Natal', -27.7690, 30.7920], ['Empangeni', 'KwaZulu-Natal', -28.7620, 31.8930], ['Hillcrest', 'KwaZulu-Natal', -29.7810, 30.7620],
  ['Kloof', 'KwaZulu-Natal', -29.7900, 30.8300],
  ['Komani', 'Eastern Cape', -31.8980, 26.8750], ['Queenstown', 'Eastern Cape', -31.8980, 26.8750], ['Jeffreys Bay', 'Eastern Cape', -34.0330, 24.9200],
  ['Graaff-Reinet', 'Eastern Cape', -32.2520, 24.5310], ['Qonce', 'Eastern Cape', -32.8830, 27.4000], ['King William', 'Eastern Cape', -32.8830, 27.4000],
  ['Parys', 'Free State', -26.9010, 27.4560], ['Harrismith', 'Free State', -28.2750, 29.1290], ['Phuthaditjhaba', 'Free State', -28.5240, 28.8160],
  ['Makhado', 'Limpopo', -23.0430, 29.9030], ['Louis Trichardt', 'Limpopo', -23.0430, 29.9030], ['Bela-Bela', 'Limpopo', -24.8850, 28.2930],
  ['Phalaborwa', 'Limpopo', -23.9430, 31.1410], ['Modimolle', 'Limpopo', -24.7000, 28.4000],
  ['Ermelo', 'Mpumalanga', -26.5330, 29.9830], ['Standerton', 'Mpumalanga', -26.9500, 29.2400], ['White River', 'Mpumalanga', -25.3300, 31.0100],
  ['Hazyview', 'Mpumalanga', -25.0440, 31.1270], ['Barberton', 'Mpumalanga', -25.7860, 31.0530], ['Lydenburg', 'Mpumalanga', -25.0950, 30.4500],
  ['Vryburg', 'North West', -26.9570, 24.7280], ['Zeerust', 'North West', -25.5370, 26.0750], ['Hartbeespoort', 'North West', -25.7470, 27.8510],
  ['De Aar', 'Northern Cape', -30.6500, 24.0120], ['Kuruman', 'Northern Cape', -27.4520, 23.4320],
];

export const provinceCentres = {
  'Gauteng': [-26.2041, 28.0473], 'Western Cape': [-33.9249, 18.4241], 'KwaZulu-Natal': [-29.8587, 31.0218], 'Eastern Cape': [-32.2968, 26.4194],
  'Free State': [-28.4541, 26.7968], 'Limpopo': [-23.4013, 29.4179], 'Mpumalanga': [-25.5653, 30.5279], 'North West': [-26.6639, 25.2838],
  'Northern Cape': [-29.0467, 21.8569],
};

// Find coordinates for a location string like "Sandton, Gauteng" or "Durban North".
const reCache = new Map();
const placeRe = name => { let re = reCache.get(name); if (!re) { re = new RegExp(`(^|[^a-z])${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z])`); reCache.set(name, re); } return re; };

export function placeFor(text) {
  const t = String(text || '').toLowerCase();
  if (!t) return null;
  // The first place named is usually the most specific ("Sandton, Johannesburg" → Sandton).
  let best = null;
  for (const [name, province, lat, lon] of places) {
    const m = t.match(placeRe(name));                     // whole words only: "Durban" must not match "Durbanville"
    if (!m) continue;
    const at = m.index + m[1].length;
    if (!best || at < best.at || (at === best.at && name.length > best.name.length)) best = {name, province, lat, lon, at};
  }
  if (best) return best;
  for (const [province, [lat, lon]] of Object.entries(provinceCentres)) {
    if (t.includes(province.toLowerCase())) return {name: province, province, lat, lon, approx: true};
  }
  return null;
}
