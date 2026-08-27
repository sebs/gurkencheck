Feature: Scenarios that all do something
  Padded so that line numbers here and in the UsingRules twin
  are identical, and both can share one list of expectations.

  Background:
    Given step6
    When step7

  Scenario: Has its own When
    Given step10
    When step11
    Then step12

  Scenario: Leans on the Background
    Then step15

  Scenario: Acts by way of an And
    Given step18
    When step19
    And step20
    Then step21
