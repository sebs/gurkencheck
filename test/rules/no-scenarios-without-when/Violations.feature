Feature: Scenarios that never do anything
  Padded so that line numbers here and in the UsingRules twin
  are identical, and both can share one list of expectations.

  Scenario: Given and Then only
    Given step6
    Then step7

  Scenario: Given only
    Given step10

  Scenario Outline: Outline with no action
    Given step13
    Then step14
    Examples:
      | foo |
      | bar |
