Feature: Scenarios that never do anything, written inside a Rule

  Rule: everything below sits inside a Rule

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
