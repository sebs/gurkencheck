Feature: Scenarios that never check anything
  Padded so that line numbers here and in the UsingRules twin
  are identical, and both can share one list of expectations.

  Scenario: Given and When only
    Given step6
    When step7

  Scenario: When only
    When step10

  Scenario Outline: Outline with no verification
    Given step13
    When step14
    Examples:
      | foo |
      | bar |
