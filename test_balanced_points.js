// Test script for balanced point system
console.log('Testing Balanced Point System:');
console.log('=====================================');

// Mock the functions for testing
function americanOddsToImpliedProbability(americanOdds) {
  if (americanOdds > 0) {
    return 100 / (americanOdds + 100);
  } else {
    return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  }
}

function calculateBalancedPoints(americanOdds, basePoints = 1000) {
  if (americanOdds === 0 || Math.abs(americanOdds) <= 5) {
    return { favorite_points: basePoints, underdog_points: basePoints };
  }
  
  let favoriteWinProbability, underdogWinProbability;
  let favorite_points, underdog_points;
  
  if (americanOdds < 0) {
    favoriteWinProbability = americanOddsToImpliedProbability(americanOdds);
    underdogWinProbability = 1 - favoriteWinProbability;
    
    underdog_points = basePoints;
    favorite_points = Math.floor((underdogWinProbability * basePoints) / favoriteWinProbability);
  } else {
    underdogWinProbability = americanOddsToImpliedProbability(americanOdds);
    favoriteWinProbability = 1 - underdogWinProbability;
    
    favorite_points = basePoints;
    underdog_points = Math.floor((favoriteWinProbability * basePoints) / underdogWinProbability);
  }
  
  favorite_points = Math.max(Math.floor(basePoints * 0.1), favorite_points);
  underdog_points = Math.max(Math.floor(basePoints * 0.1), underdog_points);
  
  return { favorite_points, underdog_points, favoriteWinProbability, underdogWinProbability };
}

// Test cases
const testCases = [
  { odds: -120, description: 'Slight favorite' },
  { odds: -150, description: 'Moderate favorite' },
  { odds: -200, description: 'Heavy favorite' },
  { odds: +150, description: 'Moderate underdog' },
  { odds: +200, description: 'Heavy underdog' },
  { odds: 0, description: 'Pick-em' }
];

testCases.forEach(({ odds, description }) => {
  console.log(`\n${description} (${odds > 0 ? '+' : ''}${odds}):`);
  
  const result = calculateBalancedPoints(odds);
  const favProb = result.favoriteWinProbability || 0.5;
  const underdogProb = result.underdogWinProbability || 0.5;
  
  console.log(`  Favorite: ${result.favorite_points} points (${(favProb * 100).toFixed(1)}% win chance)`);
  console.log(`  Underdog: ${result.underdog_points} points (${(underdogProb * 100).toFixed(1)}% win chance)`);
  
  // Expected value calculation
  const favExpected = favProb * result.favorite_points;
  const underdogExpected = underdogProb * result.underdog_points;
  
  console.log(`  Expected Value - Favorite: ${favExpected.toFixed(1)}, Underdog: ${underdogExpected.toFixed(1)}`);
  console.log(`  Balanced: ${Math.abs(favExpected - underdogExpected) < 1 ? '✓' : '✗'}`);
});

console.log('\n=====================================');
console.log('Balanced point system test complete!'); 