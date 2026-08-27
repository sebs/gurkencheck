Feature: Scenarios that never check anything, written inside a Rule

  Rule: everything below sits inside a Rule

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
