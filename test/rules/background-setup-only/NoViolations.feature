Feature: A Background that only sets up
  Padded so that line numbers here and in the UsingRules twin
  are identical, and both can share one list of expectations.

  Background:
    Given step6
    And step7
    But step8

  Scenario: One
    Given step11

  Scenario: Two
    Given step14
