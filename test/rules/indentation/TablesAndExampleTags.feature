Feature: Tables and Examples tags

  Scenario Outline: With a table
    Given a table
      | a | b |
          | 1 | 2 |
    Then <x>

      @wrongly-placed
    Examples:
      | x |
      | 1 |
