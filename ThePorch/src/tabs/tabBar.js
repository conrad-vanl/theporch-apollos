import { compose } from 'recompose';
import { BottomTabBar } from 'react-navigation';

import { withTabBarMediaSpacer } from '@apollosproject/ui-media-player';
import { styled, withTheme } from '@apollosproject/ui-kit';

const ThemedBottomTabBar = compose(
  withTheme(({ theme }) => ({
    showLabel: true,
    activeTintColor: theme.colors.screen,
    inactiveTintColor: theme.colors.lightTertiary,
    safeAreaInset: { bottom: 0 },
  })),
  styled(({ theme }) => ({
    borderTopWidth: 0,
    backgroundColor: theme.colors.background.paper,
    marginTop: theme.sizing.baseUnit * 0.3125,
    marginBottom: theme.sizing.baseUnit * 0.3125,
  })),
  withTabBarMediaSpacer
)(BottomTabBar);

export default ThemedBottomTabBar;
