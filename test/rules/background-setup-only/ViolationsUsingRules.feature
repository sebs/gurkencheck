Feature: A Background doing more than setting up, written inside a Rule

  Rule: everything below sits inside a Rule

    Background:
      Given step6
      When step7
      And step8
      Then step9

    Scenario: One
      Given step12

    Scenario: Two
      Given step15
