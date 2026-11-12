export type ChromeGroupColor =
  | 'grey'
  | 'blue'
  | 'red'
  | 'yellow'
  | 'green'
  | 'pink'
  | 'purple'
  | 'cyan'
  | 'orange';

export interface TabRule {
  id: string;
  name: string;
  color: ChromeGroupColor;
  patterns: string[];
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AutoTabberSettings {
  autoCollapseInactive: boolean;
  retroactiveGroupingOnStartup: boolean;
}

export interface StorageData {
  rules: TabRule[];
  settings: AutoTabberSettings;
}

export interface MatchResult {
  rule: TabRule;
  matchedPattern: string;
  specificityScore: number;
}
