Feature: A

  Scenario Outline: Quotes and equals
    Given the <user's name> is set
    And <a=b> holds

    Examples:
      | user's name | a=b |
      | Ann         | 1   |
