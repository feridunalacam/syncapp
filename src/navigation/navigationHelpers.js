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

  const state = navigation.getState();
  if (state?.routeNames?.includes('CreateRoutine')) {
    navigation.navigate('CreateRoutine', params);
  } else {
    navigation.navigate('Routine', { screen: 'CreateRoutine', params });
  }
};
