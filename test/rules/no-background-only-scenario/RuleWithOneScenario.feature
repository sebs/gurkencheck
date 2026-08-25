Feature: Backgrounds inside rules

  Rule: A rule with two scenarios
    Background:
      Given shared setup

    Scenario: First
      Then something

    Scenario: Second
      Then something else

  Rule: A rule with only one scenario
    Background:
      Given shared setup

    Scenario: Alone
      Then something
