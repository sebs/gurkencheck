Feature: Scenarios that all do something, written inside a Rule

  Rule: everything below sits inside a Rule

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
