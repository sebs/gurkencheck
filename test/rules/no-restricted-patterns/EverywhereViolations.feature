Feature: Everywhere

  Scenario Outline: Things a step carries
    Given a table
      | fine           |
      | forbidden cell |
    And a document
      """
      a forbidden line
      """

    Examples: Forbidden examples
      A forbidden description
      | x |
      | 1 |
