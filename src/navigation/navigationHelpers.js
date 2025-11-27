/**
 * Navigation helper functions to abstract away nested navigation complexity.
 * Screens shouldn't need to know about the internal structure of navigators.
 */

/**
 * Navigate to CreateRoutine screen
 * Works from both inside and outside the RoutineStackNavigator
 * @param {Object} navigation - Navigation object from React Navigation
 * @param {Object|null} templateRoutine - Optional routine to use as template (pre-fills form)
 */
export const navigateToCreateRoutine = (navigation, templateRoutine = null) => {
  const params = templateRoutine ? { templateRoutine } : {};
  
  // Check if we're already inside the RoutineStackNavigator
  // by checking if we can navigate directly to CreateRoutine
  const state = navigation.getState();
  const currentRoute = state?.routes[state?.index];
  
  // If we're already in the RoutineStack (RoutineList or CreateRoutine screens),
  // use direct navigation which preserves the stack
  if (currentRoute?.state?.routes?.some(r => 
    r.name === 'RoutineList' || r.name === 'CreateRoutine'
  )) {
    // We're inside the RoutineStack - use direct navigation
    navigation.navigate('CreateRoutine', params);
  } else {
    // We're outside the RoutineStack (e.g., on HomeScreen) - use nested navigation
    navigation.navigate('Routine', {
      screen: 'CreateRoutine',
      params,
    });
  }
};

