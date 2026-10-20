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
];

export const provinceCentres = {
  'Gauteng': [-26.2041, 28.0473], 'Western Cape': [-33.9249, 18.4241], 'KwaZulu-Natal': [-29.8587, 31.0218], 'Eastern Cape': [-32.2968, 26.4194],
  'Free State': [-28.4541, 26.7968], 'Limpopo': [-23.4013, 29.4179], 'Mpumalanga': [-25.5653, 30.5279], 'North West': [-26.6639, 25.2838],
  'Northern Cape': [-29.0467, 21.8569],
};

// Find coordinates for a location string like "Sandton, Gauteng" or "Durban North".
export function placeFor(text) {
  const t = String(text || '').toLowerCase();
  if (!t) return null;
  // The first place named is usually the most specific ("Sandton, Johannesburg" → Sandton).
  let best = null;
  for (const [name, province, lat, lon] of places) {
    const at = t.indexOf(name.toLowerCase());
    if (at < 0) continue;
    if (!best || at < best.at || (at === best.at && name.length > best.name.length)) best = {name, province, lat, lon, at};
  }
  if (best) return best;
  for (const [province, [lat, lon]] of Object.entries(provinceCentres)) {
    if (t.includes(province.toLowerCase())) return {name: province, province, lat, lon, approx: true};
  }
  return null;
}
