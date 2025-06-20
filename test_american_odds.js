// Test script for American odds conversion
const { 
  americanOddsToDecimal, 
  decimalToAmericanOdds, 
  calculateMatchPointsFromAmerican,
  formatAmericanOdds,
  getAmericanOddsDescription 
} = require('./src/lib/points.ts');

console.log('Testing American Odds Conversion:');
console.log('');

// Test cases from your image
const testCases = [
  { american: -150, description: 'Slight favorite' },
  { american: -200, description: 'Moderate favorite' },
  { american: -300, description: 'Heavy favorite' },
  { american: +150, description: 'Slight underdog' },
  { american: +200, description: 'Moderate underdog' },
  { american: +300, description: 'Heavy underdog' }
];

testCases.forEach(({ american, description }) => {
  console.log(`${description}: ${formatAmericanOdds(american)}`);
  
  const decimal = americanOddsToDecimal(american);
  console.log(`  Decimal odds: ${decimal.toFixed(2)}`);
  
  const points = calculateMatchPointsFromAmerican(american);
  console.log(`  Favorite points: ${points.favorite_points}`);
  console.log(`  Underdog points: ${points.underdog_points}`);
  console.log(`  Description: ${getAmericanOddsDescription(american)}`);
  console.log('');
});

// Test conversion back and forth
console.log('Testing round-trip conversion:');
const originalAmerican = -150;
const convertedDecimal = americanOddsToDecimal(originalAmerican);
const backToAmerican = decimalToAmericanOdds(convertedDecimal);
console.log(`Original: ${originalAmerican}, Decimal: ${convertedDecimal}, Back: ${backToAmerican}`); 