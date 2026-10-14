Feature: Buying

  Scenario: Buy 1
    Given a step

  Scenario Outline: Buy <count>
    Given <count> things

    Examples:
      | count |
      | 1     |
      | 2     |
