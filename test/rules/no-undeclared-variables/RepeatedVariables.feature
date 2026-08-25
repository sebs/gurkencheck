Feature: A variable that goes wrong more than once

  Scenario Outline: An undeclared variable used on several lines
    Given this is step <a>
    And this is step <b>
    When I do that with <b>
    Then something should happen with <b>

    Examples:
      | a |
      | 1 |

  Scenario Outline: An unused column declared in two examples tables
    Given this is step <a>

    Examples:
      | a | b |
      | 1 | 2 |

    Examples:
      | a | b |
      | 3 | 4 |
