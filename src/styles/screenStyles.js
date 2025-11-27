import { StyleSheet, Platform } from 'react-native';

export const createScreenStyles = (theme) => {
  return StyleSheet.create({
  //#region COMMON / SHARED STYLES - Used across multiple screens
  container: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
  },
  centeredContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
      fontSize: theme.fontSize['3xl'],
      fontWeight: theme.fontWeight.bold,
      marginBottom: theme.spacing.sm,
    textAlign: 'center',
      color: theme.text,
  },
  description: {
      fontSize: theme.fontSize.md,
      color: theme.textSecondary,
    textAlign: 'center',
  },
  pageTitle: {
    fontSize: theme.fontSize['3xl'],
    fontWeight: theme.fontWeight.bold,
    color: theme.text,
  },
  pageHeader: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },
  pageHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
      backgroundColor: theme.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
      borderColor: theme.borderDark,
      ...theme.shadow.md,
  },
  button: {
    borderRadius: 12,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  primaryButton: {
      backgroundColor: theme.buttonPrimary,
  },
  buttonTextPrimary: {
      color: theme.buttonText,
      fontWeight: theme.fontWeight.semibold,
  },
  modalBackdrop: {
    flex: 1,
      backgroundColor: theme.modalOverlay,
    alignItems: 'center',
    justifyContent: 'center',
      padding: theme.spacing['2xl'],
  },
  modalCard: {
    width: '100%',
      backgroundColor: theme.modalBackground,
    borderRadius: 20,
      padding: theme.spacing.xl,
      ...theme.shadow.lg,
  },
  modalTitle: {
      fontSize: theme.fontSize.xl,
      fontWeight: theme.fontWeight.bold,
      marginBottom: theme.spacing.lg,
      color: theme.text,
  },
  inputGroup: {
    flex: 1,
  },
  input: {
    borderWidth: 1,
      borderColor: theme.inputBorder,
    borderRadius: 12,
      paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
      fontSize: theme.fontSize.md,
      color: theme.inputText,
      backgroundColor: theme.inputBackground,
      marginBottom: theme.spacing.md,
  },
  label: {
      fontSize: theme.fontSize.base,
      color: theme.textSecondary,
      marginBottom: theme.spacing.xs,
  },
  //#endregion

  //#region HOME SCREEN - Styles specific to HomeScreen.js
  topBar: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.lg,
      paddingBottom: theme.spacing.md,
  },
  routineSelectorBar: {
    flex: 1,
    marginTop: 6,
  },
  routineDropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
  },
  routineSelectorTextContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
      gap: theme.spacing.sm,
      marginRight: theme.spacing.sm,
      paddingVertical: theme.spacing.md,
    paddingHorizontal: 15,
    borderRadius: 20,
      backgroundColor: theme.routineSelector,
    borderWidth: 0,
      ...theme.shadow.md,
  },
  routineSelectorActions: {
    flexDirection: 'row',
    alignItems: 'center',
      gap: theme.spacing.xs,
  },
  routineSelectorActionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
      backgroundColor: theme.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
      borderColor: theme.borderLight,
  },
  routineSelectorTitle: {
      fontSize: theme.fontSize.lg,
      fontWeight: theme.fontWeight.bold,
      color: theme.routineSelectorText,
    flex: 1,
  },
  routineDropdownMenu: {
    position: 'absolute',
    top: 68,
      left: theme.spacing.xl,
      right: theme.spacing.xl,
      backgroundColor: theme.modalBackground,
    borderRadius: 16,
      ...theme.shadow.lg,
    maxHeight: 300,
    zIndex: 1000,
    borderWidth: 1,
      borderColor: theme.borderLight,
  },
  routineDropdownItem: {
    paddingVertical: 14,
      paddingHorizontal: theme.spacing.lg,
    borderBottomWidth: 1,
      borderBottomColor: theme.borderLight,
  },
  routineDropdownItemLast: {
    borderBottomWidth: 0,
  },
  routineDropdownItemText: {
      fontSize: theme.fontSize.md,
      color: theme.text,
      fontWeight: theme.fontWeight.medium,
  },
  routineDropdownItemTextSelected: {
      color: theme.accent,
      fontWeight: theme.fontWeight.bold,
  },
  timerBox: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  timerValue: {
      color: theme.timerText || theme.text,
    fontSize: 140,
    fontWeight: Platform.select({
      ios: '700',
      android: 'bold',
      default: 'bold',
    }),
    letterSpacing: 2,
    lineHeight: 160,
    fontFamily: Platform.select({
      ios: '.AppleSystemUIFontRounded',
      android: 'sans-serif-light',
      default: 'System',
    }),
  },
  timerContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: 370,
    height: 370,
  },
  roundsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
      marginTop: theme.spacing['2xl'],
      marginBottom: theme.spacing.lg,
      paddingHorizontal: theme.spacing.lg,
    paddingVertical: 10,
    borderRadius: 999,
      backgroundColor: theme.isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.9)',
    borderWidth: 1,
      borderColor: theme.border,
      ...theme.shadow.sm,
  },
  roundCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
      borderColor: theme.border,
      backgroundColor: theme.cardSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundCircleActive: {
      borderColor: theme.accent,
    borderWidth: 2,
      backgroundColor: theme.accentLight,
      ...theme.shadow.md,
  },
  roundCircleCompleted: {
      borderColor: theme.border,
      backgroundColor: theme.cardSecondary,
  },
  roundCircleText: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
      color: theme.textTertiary,
  },
  roundCircleTextActive: {
      color: theme.accent,
      fontWeight: theme.fontWeight.bold,
  },
  roundCircleTextCompleted: {
      color: theme.textSecondary,
  },
  roundCard: {
      backgroundColor: theme.card,
    borderRadius: 14,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.lg,
      marginBottom: theme.spacing.sm,
    borderWidth: 1,
      borderColor: theme.border,
      ...theme.shadow.sm,
  },
  roundCardActive: {
      borderColor: theme.accent,
    borderWidth: 2,
      backgroundColor: theme.accentLight,
  },
  roundBadge: {
      backgroundColor: theme.roundBadgeBg,
      paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1.5,
      borderColor: theme.roundBadgeBorder,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
      marginBottom: theme.spacing.sm,
  },
  summaryLabel: {
      fontSize: theme.fontSize.md,
      color: theme.textSecondary,
  },
  summaryValue: {
      fontSize: theme.fontSize.lg,
      fontWeight: theme.fontWeight.semibold,
      color: theme.text,
  },
  workoutControlBar: {
    width: '100%',
    alignSelf: 'center',
    backgroundColor: 'transparent',
      paddingVertical: theme.spacing.lg,
      paddingHorizontal: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
      gap: theme.spacing.sm,
    marginTop: 0,
      marginBottom: theme.spacing['2xl'],
    minHeight: 64,
    borderRadius: 0,
  },
  controlButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlButtonPrimary: {
    width: 64,
    height: 64,
    borderRadius: 32,
      backgroundColor: theme.card,
    borderWidth: 0,
      ...theme.shadow.md,
  },
  controlButtonSide: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlButtonReset: {
    width: 40,
    height: 40,
    borderRadius: 0,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  //#endregion

  //#region ROUTINE LIST SCREEN - Styles specific to RoutineListScreen.js
  routineCard: {
    borderRadius: 12,
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.lg,
    marginBottom: 0,
      backgroundColor: theme.card,
    borderWidth: 0,
      borderColor: theme.border,
  },
  routineCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
      gap: theme.spacing.md,
    marginBottom: 6,
  },
  routineHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
      gap: theme.spacing.sm,
  },
  routineDurationPill: {
    flexDirection: 'row',
    alignItems: 'center',
      gap: theme.spacing.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
      backgroundColor: theme.cardSecondary,
  },
  routineDurationText: {
      fontSize: theme.fontSize.xs,
      color: theme.textSecondary,
      fontWeight: theme.fontWeight.medium,
  },
  routineDeleteButton: {
      padding: theme.spacing.xs,
    borderRadius: 16,
  },
  routineMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
      gap: theme.spacing.sm,
      marginTop: theme.spacing.xs,
  },
  routineMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
      gap: theme.spacing.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
      backgroundColor: theme.cardSecondary,
  },
  routineMetaText: {
      fontSize: theme.fontSize.xs,
      color: theme.textSecondary,
      fontWeight: theme.fontWeight.medium,
  },
  roundTitle: {
    fontSize: 15,
      fontWeight: theme.fontWeight.medium,
      color: theme.text,
  },
  roundList: {
    paddingBottom: 60,
  },
  reorderButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.cardSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderButtonDisabled: {
    opacity: 0.4,
  },
  //#endregion

  //#region CREATE ROUTINE SCREEN - Styles specific to CreateRoutineScreen.js
  sectionContainer: {
      backgroundColor: theme.card,
    borderRadius: 16,
      padding: theme.spacing.lg,
      marginBottom: theme.spacing.lg,
    borderWidth: 1,
      borderColor: theme.border,
  },
  sectionTitle: {
      fontSize: theme.fontSize.lg,
      fontWeight: theme.fontWeight.bold,
      color: theme.text,
      marginBottom: theme.spacing.md,
  },
  saveButton: {
      backgroundColor: theme.buttonPrimary,
    paddingVertical: 10,
      paddingHorizontal: theme.spacing.xl,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
      color: theme.buttonText,
      fontSize: theme.fontSize.md,
      fontWeight: theme.fontWeight.semibold,
  },
  //#endregion

  //#region EXPLORE SCREEN - Styles specific to ExploreScreen.js
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
      marginTop: theme.spacing.sm,
  },
  //#endregion

  //#region LOG SCREEN - Styles specific to LogScreen.js
  // (Currently only uses common styles: container)
  //#endregion

  //#region PROFILE SCREEN - Styles specific to ProfileScreen.js
  signInTitle: {
      fontSize: theme.fontSize['4xl'],
      fontWeight: theme.fontWeight.bold,
      color: theme.text,
      marginBottom: theme.spacing.sm,
  },
  signInButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
      paddingVertical: theme.spacing.lg,
      paddingHorizontal: theme.spacing['2xl'],
    borderRadius: 12,
      marginBottom: theme.spacing.md,
    borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
  },
  signInButtonText: {
      fontSize: theme.fontSize.md,
      fontWeight: theme.fontWeight.semibold,
      color: theme.text,
      marginLeft: theme.spacing.md,
  },
  //#endregion
});
};

// Backward compatibility - create default styles with light theme
// This will be replaced by components using useTheme hook
import { lightTheme } from '../themes/lightTheme';
const defaultScreenStyles = createScreenStyles({ ...lightTheme, isDark: false });
export const screenStyles = defaultScreenStyles;
