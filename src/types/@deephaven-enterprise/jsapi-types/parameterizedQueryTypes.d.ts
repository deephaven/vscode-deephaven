export interface CompositionType {
  And: CompositionType;
  Or: CompositionType;
}

export interface ComparisonType {
  GreaterThanEqual: ComparisonType;
  GreaterThan: ComparisonType;
  LessThanEqual: ComparisonType;
  LessThan: ComparisonType;
}

export interface ConstraintType {
  In: ConstraintType;
  Unconstrained: ConstraintType;
  Composition: ConstraintType;
  Comparison: ConstraintType;
}

export interface DisplayType {
  CheckBox: DisplayType;
  DatePicker: DisplayType;
  DateTimePicker: DisplayType;
  DeephavenTable: DisplayType;
  DropDown: DisplayType;
  EditableList: DisplayType;
  FixedList: DisplayType;
  Text: DisplayType;
}

export interface ValueType {
  Boolean: ValueType;
  DateTime: ValueType;
  Double: ValueType;
  Long: ValueType;
  String: ValueType;
}

export interface Parameterized {
  ConstraintType: ConstraintType;
  CompositionType: CompositionType;
  ComparisonType: ComparisonType;
  DisplayType: DisplayType;
}

export declare const ParameterizedQueryVariableType: {
  readonly PARAMETERIZEDQUERY: 'ParameterizedQuery';
};
