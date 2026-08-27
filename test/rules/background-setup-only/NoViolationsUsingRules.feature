Feature: A Background that only sets up, written inside a Rule

  Rule: everything below sits inside a Rule

    Background:
      Given step6
      And step7
      But step8

    Scenario: One
      Given step11

    Scenario: Two
      Given step14
